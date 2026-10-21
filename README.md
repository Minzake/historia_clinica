# Consultorio de podología

Aplicación privada con React + TypeScript + Vite, desplegable en Vercel. Supabase proporciona PostgreSQL, autenticación y permisos por consultorio.

## Incluye

- Login, recuperación de contraseña y cierre de sesión. Registro público de pacientes, sin permisos clínicos.
- Inicio con búsqueda, estadísticas reales y planillas vacías para imprimir.
- Pacientes con búsqueda por nombre (sin distinguir tildes), DNI o número de historia y paginación en servidor.
- Ficha inicial persistente: datos personales, antecedentes, vacunas, tratamientos, medicación, hábitos y respuesta sobre autorización de fotografías.
- Evoluciones por paciente; cada guardado es transaccional y conserva una versión completa.
- Detección de ediciones simultáneas: una versión antigua no sobrescribe una más reciente.
- Advertencia por cambios sin guardar, confirmación al quitar consultas y descarga de versiones anteriores.
- PDF completo, ficha inicial, evoluciones o tabla de evolución vacía. Formato continuo Fecha / Procedimiento / Firma del paciente, inspirado en `Historia Clinica hoja 2.pdf`.
- Usuarios del equipo por invitación, cambio de roles y suspensión de acceso; protección del último administrador.
- Portal del paciente con nombre, DNI obligatorio, email verificado y celular opcional. La cuenta no se vincula automáticamente a una historia clínica.
- Agenda diaria/semanal, reservas web de 30 minutos, turnos internos de duración extendida y bloqueos. Confirmación automática, cancelación y reprogramación con reglas configurables.
- Avisos de confirmación, reprogramación y cancelación mediante email transaccional, con outbox y reintentos independientes del guardado del turno.

**No incluye aún** cobros, fotografías, firma electrónica, MFA en la interfaz, WhatsApp automático ni recordatorios previos a la consulta. La autorización registrada no reemplaza el consentimiento firmado. El texto del consentimiento debe revisarse para el uso y la normativa del consultorio.

## 1. Crear y configurar Supabase

1. Creá un proyecto de Supabase. Elegí la región de almacenamiento adecuada antes de cargar datos reales.
2. En **SQL Editor**, ejecutá una sola vez y en orden los archivos de `supabase/migrations/`: primero `202610210001_consultorio.sql` y después `202610210002_booking.sql`. El comando `npm run db:migrate` controla versiones y aplica las pendientes sin reinstalar la primera. Si el proyecto ya tiene historias, nunca borres tablas para actualizarlo.
3. En **Authentication → Providers / Sign In**, habilitá correo y contraseña y el registro de pacientes. **Exigí confirmación de email** y configurá los límites de intentos/envío. Las nuevas cuentas no reciben ninguna membresía de consultorio ni acceso clínico. No confíes en campos `role` del metadata de registro. Verificá SMTP antes de abrir el registro al público.
4. En **Authentication → Users**, creá la cuenta del titular con un correo válido y una contraseña fuerte (mínimo recomendado: 12 caracteres). Si la creás manualmente y está verificada por vos, confirmá su correo desde el panel.
5. Asigná la cuenta al consultorio ejecutando este bloque en SQL Editor. **Reemplazá el correo antes de ejecutar.** Solo debe ejecutarse una vez para el primer titular:

```sql
do $$
declare
  v_user uuid;
  v_clinic uuid;
begin
  select id into v_user from auth.users where lower(email) = lower('titular@tu-consultorio.com');
  if v_user is null then raise exception 'Primero creá el usuario en Authentication'; end if;

  insert into public.clinics(settings)
  values ('{"name":"Mi consultorio de podología","professional":"","address":"","phone":"","email":"","license":""}')
  returning id into v_clinic;

  insert into public.clinic_members(user_id, clinic_id, role)
  values (v_user, v_clinic, 'owner');
end;
$$;
```

Una cuenta autenticada **sin asignación no puede leer ni crear historias**. Cada usuario pertenece a un único consultorio en esta primera versión.

### Agregar otro profesional al mismo consultorio

Creá su cuenta en Authentication y ejecutá, reemplazando ambos correos:

```sql
insert into public.clinic_members(user_id, clinic_id, role)
select u.id, m.clinic_id, 'professional'
from auth.users u
cross join public.clinic_members m
join auth.users titular on titular.id = m.user_id
where lower(u.email) = lower('profesional@tu-consultorio.com')
  and lower(titular.email) = lower('titular@tu-consultorio.com');
```

`owner` y `professional` pueden consultar y editar historias del mismo consultorio; solo `owner` modifica la configuración y el equipo. Un profesional gestiona sus propios turnos; los administradores pueden gestionar la agenda del consultorio. **No asignes estos roles a recepción**: no existe todavía un rol administrativo con acceso clínico restringido. La pantalla **Usuarios** utiliza una API de servidor que valida el token, el rol y el consultorio; el navegador no puede escribir membresías directamente.

### Seeder de administradores

La migración también puede ejecutarse con `npm run db:migrate` cuando hay conexión PostgreSQL disponible. El script aplica la instalación inicial en una transacción, registra su checksum y no borra ni reinicia datos. Si encuentra tablas parcialmente creadas, falta de RLS o permisos inseguros, se detiene para revisión. Necesita una de las variables `POSTGRES_URL`, `POSTGRES_URL_NON_POOLING` o `POSTGRES_PRISMA_URL` del servidor, con TLS validado. Descarga por HTTPS la CA pública de Supabase y comprueba su huella SHA-256 y vigencia; no desactiva la validación de certificados ni del nombre del servidor.

Para una instalación inicial desde Vercel, se puede autorizar expresamente durante un despliegue con `vercel deploy --prod --build-env INITIALIZE_CONSULTORIO_DB=1`. **Una compilación normal no ejecuta migraciones ni abre conexiones PostgreSQL.** No guardes ese indicador como variable permanente del proyecto. La creación manual mediante SQL Editor sigue siendo una alternativa.

Como alternativa a la asignación manual, después de instalar la migración podés ejecutar el seeder desde Node. Utiliza `SUPABASE_SECRET_KEY` o `SUPABASE_SERVICE_ROLE_KEY` de `.env.local`, sin exponerla al navegador.

```sh
npm run db:check -- --emails "administrador@example.com,duena@example.com"
npm run db:seed -- --emails "administrador@example.com,duena@example.com"
```

El primer comando solo comprueba las columnas de las tablas, las cuentas y sus asignaciones. Los RPC clínicos requieren una sesión de usuario y se verifican después del login, no con la clave administrativa. El segundo comando asigna las cuentas existentes como `owner` al mismo consultorio. Reutiliza sus asignaciones o el único consultorio disponible; si hay ambigüedad o asignaciones diferentes, se detiene en lugar de mover cuentas. Podés indicar `--clinic-id UUID`. Nunca cambia contraseñas, sobreescribe la configuración existente ni crea pacientes de ejemplo.

Si faltan las cuentas en **Authentication → Users**, no se crean automáticamente. Para crearlas mediante invitación, confirmá previamente los destinatarios y configurá la URL de redirección permitida en Supabase:

```sh
npm run db:seed -- --emails "administrador@example.com,duena@example.com" --invite --redirect-url "https://tu-dominio.vercel.app/recuperar"
```

Cada destinatario recibirá un correo para definir su contraseña. Antes de enviar invitaciones, el comando comprueba que la ruta `/recuperar` esté disponible en el dominio de destino: desplegá primero la aplicación nueva. Las cuentas existentes no reciben invitaciones nuevas ni se cambian sus contraseñas. Las invitaciones dependen de SMTP, de los límites de correo y de las URLs permitidas en Supabase; no uses contraseñas compartidas o fijas en el código. Las cuentas del panel/organización de Supabase **no son** las cuentas de acceso de la aplicación: estas deben existir en Supabase Auth.

Si necesitás ejecutar ese seeder desde un despliegue de Vercel, autorizalo solo para esa compilación con `--build-env INITIALIZE_CONSULTORIO_ADMINS=1`, `--build-env SEED_ADMIN_EMAILS=correo1,correo2` y, para enviar invitaciones, `--build-env SEED_SEND_INVITES=1` y `--build-env SEED_INVITE_REDIRECT_URL=https://tu-dominio/recuperar`. No son indicadores permanentes del proyecto: sin ellos, las compilaciones no crean cuentas, no asignan roles y no envían correos.

## Agenda: puesta en marcha

La agenda web empieza **cerrada, sin profesional ni franjas inventadas**. La dueña debe entrar en **Agenda → Horarios**:

1. Seleccionar su propia cuenta como profesional (no la cuenta administrativa técnica).
2. Completar el nombre público y elegir un identificador para el enlace de reservas.
3. Agregar los días/franjas reales de atención. Se pueden separar mañana y tarde.
4. Revisar los valores iniciales editables: hasta 30 días de anticipación, mínimo 120 minutos antes, y cambios hasta 12 horas antes. No se aplican públicamente hasta guardar y habilitar las reservas.
5. Habilitar reservas web y compartir `/reservar` o `/reservar/identificador`.

La web reserva siempre **30 minutos** y confirma en una transacción. Desde **Nuevo turno**, la profesional puede asignar otras duraciones (15 a 480 minutos, en pasos de 15). Los bloqueos permiten ausencias de varios días. La restricción de exclusión de PostgreSQL impide superposiciones, incluso con solicitudes simultáneas. Un turno manual puede estar fuera del horario publicado; igual respeta los bloqueos y otros turnos.

Los pacientes pueden tener hasta tres reservas futuras por consultorio y diez acciones recientes por hora. Solo pueden cambiar sus propias reservas dentro del plazo. Las consultas extendidas asignadas por el profesional no se reprograman desde la web; pueden cancelarse dentro del plazo o gestionarse contactando al consultorio. En **Nuevo turno**, la profesional puede elegir explícitamente una cuenta verificada conocida por ese consultorio para que una atención extendida aparezca en su portal. Los datos de esa cuenta se recuperan y validan en el servidor, no se confía en los datos del formulario para identificar a otra persona.

Al completar su registro, el paciente comparte sus datos de contacto con el consultorio elegido (o con el único consultorio de esta instalación). Reservar en otro consultorio también habilita que su equipo vea esos datos de contacto; no permite consultar cuentas de otros consultorios. Las reservas manuales sin cuenta no se asocian automáticamente por email o DNI, y ninguna de estas relaciones concede acceso a una historia clínica.

## Email de turnos (servidor)

Los correos de registro/contraseña los gestiona **Supabase Auth**. Los avisos de turnos son otro servicio: esta versión utiliza **Resend** desde las funciones de Vercel. Configurá, sin prefijo `VITE_`:

```dotenv
APP_URL=https://tu-dominio.vercel.app
RESEND_API_KEY=re_REEMPLAZAR_EN_EL_SERVIDOR
NOTIFICATIONS_FROM_EMAIL=Consultorio <turnos@tu-dominio-verificado.com>
CRON_SECRET=UN_SECRETO_ALEATORIO_LARGO
```

Verificá tu dominio/remitente en Resend antes de usar direcciones reales y volvé a desplegar tras cargar las variables. **Sin proveedor/remitente, los avisos quedan pendientes y la interfaz lo informa; no se simula un envío exitoso.** No se configura un servicio de pago ni se envían mensajes de WhatsApp automáticamente.

Cada reserva/cambio/cancelación genera su evento y correo en la misma transacción. Luego la API intenta despacharlo. Un fallo de correo no deshace ni duplica el turno. La cola usa exclusión de trabajadores y claves de idempotencia en Resend; se reintenta hasta ocho veces. `/api/notifications` acepta POST con sesión válida y solo procesa avisos propios o del consultorio autorizado. El GET de reintentos requiere `CRON_SECRET` y se programa diariamente a las 12:00 UTC en Vercel (no es un recordatorio ni una garantía de entrega inmediata). El equipo también puede usar **Procesar avisos pendientes**. Después de agotar los intentos se requiere revisión administrativa del servicio/cola.

Los mensajes contienen fecha, hora, lugar y contacto: no incluyen DNI, notas internas ni información clínica. Cada modificación conserva auditoría y los avisos anteriores no se borran. Los eventos pendientes reemplazados por un cambio posterior quedan marcados como superados para no enviar horarios obsoletos.

## 2. Desarrollo local

Requiere Node.js 22.12+ (se verificó con Node.js 24).

```sh
npm ci
```

Copiá `.env.example` a `.env.local` y completá:

```dotenv
VITE_SUPABASE_URL=https://TU_PROYECTO.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_TU_CLAVE_PUBLICA
```

Obtené los valores desde la configuración API / Connect de tu proyecto Supabase. También se admiten los nombres de la integración con Vercel: `VITE_PUBLIC_SUPABASE_URL` y `VITE_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, sin necesidad de renombrarlos. Para la clave pública JWT antigua se acepta `VITE_SUPABASE_ANON_KEY` o `VITE_PUBLIC_SUPABASE_ANON_KEY`.

Si están presentes ambos nombres, los originales `VITE_SUPABASE_*` tienen prioridad para el mismo tipo de variable. Se prefiere una clave `PUBLISHABLE_KEY` antes que una `ANON_KEY`; los valores vacíos se omiten.

**Nunca uses `service_role`, `sb_secret_…` ni la contraseña de PostgreSQL en variables `VITE_`: todo valor `VITE_` es visible en el navegador.** El cliente rechaza las claves administrativas conocidas, pero no reemplaza una correcta gestión de secretos.

```sh
npm run dev
```

Sin estas variables se muestra una pantalla de configuración, no una base ficticia ni un acceso inseguro. Reiniciá Vite si cambiás las variables.

## 3. Conectar el despliegue existente en Vercel

No hace falta cambiar el proyecto ni migrar el frontend a otro alojamiento.

1. En **Vercel → Project → Settings → Environment Variables**, cargá `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` para el entorno correspondiente. Si la integración ya cargó `VITE_PUBLIC_SUPABASE_URL` y `VITE_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, podés conservar esos nombres.
2. Conservá el preset **Vite**, el comando `npm run build` y el directorio de salida `dist`.
3. Hacé un **Redeploy**. Estas variables se insertan al compilar: no basta con agregarlas sin volver a desplegar.
4. En **Supabase → Authentication → URL Configuration**, configurá:
   - **Site URL:** `https://tu-dominio.vercel.app` (o el dominio definitivo).
   - **Redirect URLs:** `https://tu-dominio.vercel.app/recuperar` y `https://tu-dominio.vercel.app/mis-turnos`; para desarrollo, sus equivalentes en `http://localhost:5173`.
   - Agregá expresamente cualquier otro dominio utilizado; evitá comodines amplios de producción.
5. Configurá SMTP y las políticas de contraseña / límites de intentos de Supabase antes del uso real. Probá el correo de recuperación y su expiración.
6. Iniciá sesión, completá **Consultorio**, creá un paciente de prueba, recargá, buscá su primera hoja, agregá una evolución y verificá la exportación.

`vercel.json` resuelve rutas internas al recargar, preserva las rutas `/api/` y agrega cabeceras de privacidad / seguridad. Las fichas usan identificadores UUID, pero los filtros de búsqueda pueden aparecer en la URL: no compartas enlaces de búsquedas de pacientes. Los PDF se descargan en el equipo; **no se suben a un bucket público**.

## Base de datos y seguridad

| Tabla | Contenido |
|---|---|
| `clinics` | Configuración del consultorio y contador de historias |
| `clinic_members` | Cuentas autorizadas y roles |
| `patients` | Identificación, ficha inicial y versión actual |
| `clinical_records` | Antecedentes, vacunas y valores clínicos |
| `evolutions` | Consultas ordenadas; las quitadas quedan archivadas |
| `clinical_record_versions` | Copia completa de cada guardado, fecha y autor |
| `patient_accounts` | Datos propios de la cuenta paciente, sin acceso a historias |
| `booking_settings` / `booking_hours` | Profesional, reglas y disponibilidad pública |
| `appointments` / `appointment_events` | Agenda, reservas, bloqueos y auditoría |
| `private.appointment_notifications` | Cola de email; sin acceso directo desde el navegador |

- Todas las tablas con datos clínicos, personales y de turnos tienen **Row Level Security**. El acceso anónimo se limita a funciones de disponibilidad y datos públicos del consultorio, sin nombres de pacientes ni ocupaciones de la agenda.
- El navegador tiene permisos de lectura según membresía, **sin permisos directos de escritura**. Los RPC comprueban cuenta, consultorio, datos y versión antes de modificar.
- Las escrituras se realizan en una única transacción. Un error no deja media historia guardada.
- Las versiones anteriores no son editables ni eliminables por cuentas de la aplicación. La interfaz permite descargar las últimas 30; la base conserva las demás.
- El número de historia y el DNI no vacío son únicos dentro del consultorio. La asignación automática es transaccional.
- Los datos clínicos no se copian a `localStorage`; allí Supabase conserva la sesión de acceso. El formulario mantiene cambios no guardados solo en memoria y **no funciona offline**.
- La configuración antigua del consultorio se puede importar explícitamente desde ese mismo navegador. La aplicación anterior no guardaba pacientes: no hay historias que migrar automáticamente.

### Antes de cargar información real

Definí y verificá copias de seguridad externas/restauración, retención, región de datos, políticas de acceso y requisitos legales aplicables. El historial de versiones **no sustituye un backup**. Usá equipos protegidos y cerrá sesión en dispositivos compartidos. Revisá las capacidades de backup/MFA del plan contratado; no se dan por habilitadas automáticamente. No uses datos clínicos reales en despliegues de preview ni proyectos de prueba.

## Verificaciones

```sh
npm run lint
npm test
npm run build
```

Para comprobar el despliegue sin crear cuentas, enviar correos ni reservar turnos:

```sh
npm run deployment:check -- https://tu-dominio.vercel.app
```

Verifica las páginas públicas y que las APIs rechacen solicitudes sin sesión. Si la red local no llega al dominio, puede ejecutarse desde una compilación autorizada de Vercel con `--build-env VERIFY_LIVE_APP=1` y `APP_URL` configurada. No utiliza contraseñas ni tokens de pacientes.

Prueba adicional en navegador (con endpoints simulados; no usa cuentas ni datos reales):

```sh
npm run test:e2e
```

En Windows se usa Edge instalado. En otros sistemas instalá Chromium con `npx playwright install chromium`. También podés seleccionar otro canal mediante `PLAYWRIGHT_CHANNEL`. Las capturas y PDF de prueba se generan en `test-results/` (ignorado por Git).

Las pruebas incluyen validación clínica básica, IMC con coma decimal, login/recuperación, edición y navegación con cambios pendientes, filtros de búsqueda, PDF extenso y permisos/RPC SQL ejecutados sobre PostgreSQL embebido (PGlite). Las pruebas de interfaz usan servicios simulados; las de SQL comprueban aislamiento entre consultorios y rollback con roles de base de datos.

Estas verificaciones **no reemplazan una prueba final contra tu proyecto Supabase real**: URL, configuración de Auth, envío de correos y el despliegue requieren los pasos anteriores. No se crea ni despliega infraestructura remota automáticamente.
