# Resumen para continuar en un nuevo chat

Actualizado: 21 de octubre de 2026.

## Proyecto y objetivo

- Carpeta: `C:\Users\Axel Fiol\Downloads\Nueva carpeta`.
- Comenzó como formulario de historia clínica con descarga de PDF y evolucionó a gestión de un consultorio de podología.
- Se acordó separar un núcleo genérico (usuarios, pacientes, consultorios y turnos) de los módulos clínicos por especialidad. En el futuro podría adaptarse a odontología u otros consultorios ambulatorios, pero esos módulos todavía no existen.
- Frontend: React 19, TypeScript, Vite, CSS y Lucide. PDF: jsPDF y jspdf-autotable.
- Backend: Supabase Auth y PostgreSQL con RLS y RPC; funciones Node de Vercel para equipo y notificaciones.

## Producción y cuentas

- Sitio: https://historia-clinica-rouge.vercel.app
- Proyecto Vercel: `minzakes-projects/historia-clinica`.
- El directorio está vinculado mediante `.vercel/`, ignorado por Git. Hay sesión de Vercel disponible; se utilizó `npx --yes vercel`.
- Proyecto Supabase: `yzqcvnqrwgkxpztpqmrt`.
- Administradores del MISMO consultorio:
  - `axelfiol12@gmail.com`: Axel, administrador técnico.
  - `cielcycu@gmail.com`: dueña y profesional que atiende.
- Ambas cuentas existen en Supabase Auth, están confirmadas y tienen membresía activa con rol `owner` (comprobado en producción).
- Se crearon mediante invitaciones autorizadas, sin contraseñas compartidas. No cambiar sus contraseñas ni recrearlas.
- No se cargaron pacientes ni turnos de prueba en producción. Las pruebas usan mocks o PostgreSQL embebido.

## Requisitos acordados para turnos y pacientes

- Por ahora atiende únicamente la dueña.
- Reserva web: consulta de consultorio de **30 minutos**, con confirmación automática.
- La profesional asigna desde su usuario los turnos específicos de mayor duración.
- Paciente: nombre y apellido, DNI obligatorio, email obligatorio/verificado y celular opcional.
- Login con email y contraseña; el DNI identifica la cuenta, no es su contraseña.
- Avisos al paciente por email en esta primera versión. WhatsApp quedó como integración futura, no implementada.
- El usuario NO definió días/franjas reales ni reglas definitivas de anticipación/cancelación. No inventarlas ni abrir la agenda automáticamente.

## Funcionalidades implementadas

### Historias clínicas y PDF

- Buscar fichas por nombre, DNI o número de historia y abrir la primera hoja guardada.
- Datos personales, antecedentes, vacunas, tratamientos, medicación, hábitos, calzado y respuesta de autorización fotográfica.
- Evoluciones por paciente, valores clínicos e IMC con coma decimal.
- Guardado transaccional, numeración automática, control de versiones y detección de ediciones simultáneas.
- Descarga de versiones anteriores y advertencias por cambios sin guardar.
- Exportación de historia completa, ficha inicial, evoluciones o planilla de evolución vacía.
- Segunda hoja con tabla continua **Fecha / Procedimiento / Firma del paciente**, inspirada en `Historia Clinica hoja 2.pdf`, no bloques separados.
- Textos largos y evoluciones se distribuyen en páginas sin recorte silencioso. Firma en papel, no firma electrónica.

### Usuarios

- Pantalla **Usuarios** para administradores: invitar/asignar equipo, cambiar entre `owner` y `professional`, suspender/reactivar acceso.
- El servidor verifica el token con Supabase y la membresía activa; no confía en roles enviados por el navegador o metadata de registro.
- No se permite degradar/suspender la propia cuenta ni quitar al último administrador. Para suspender a una persona con turnos futuros, primero deben gestionarse esos turnos.
- Invitaciones limitadas a cinco por hora por administrador.
- Registro público de pacientes y reenvío de verificación, recuperación de contraseña y cierre de sesión.
- Pacientes sin membresía del equipo entran a su portal, nunca al archivo clínico.
- Directorio de pacientes registrados del consultorio, separado del equipo y de las historias.
- No hay rol de recepción con acceso limitado: NO usar `professional` para recepción, porque incluye acceso clínico.

### Agenda y portal

- Agenda diaria y semanal; semana de lunes a domingo.
- Alta manual, edición, cancelación, estados confirmado/atendido/ausente y bloqueos por descansos o ausencias.
- Atenciones manuales de 15 a 480 minutos en pasos de 15; bloqueos de varios días, hasta 31 días.
- Restricción de exclusión GiST en PostgreSQL: impide superposiciones incluso con solicitudes concurrentes. Cancelar libera el horario.
- Configuración **Agenda → Horarios**: profesional, nombre público, enlace, zona horaria, franjas semanales y reglas.
- Zona predeterminada: `America/Argentina/Buenos_Aires`. Fechas se almacenan como instantes; la interfaz no depende del huso del navegador.
- La reserva web empieza CERRADA, sin profesional ni franjas publicadas.
- Valores iniciales EDITABLES: anticipación máxima 30 días, mínima 120 minutos y cambios hasta 12 horas antes. La dueña debe revisarlos antes de habilitar.
- Portal `/mis-turnos`: reservas propias, cancelación y reprogramación según plazo.
- Hasta tres turnos futuros por consultorio y diez acciones recientes por hora para pacientes.
- Las atenciones asignadas por el profesional no se reprograman por la web. Pueden cancelarse dentro del plazo o gestionarse con el consultorio.
- La dueña puede seleccionar explícitamente una cuenta verificada conocida por su consultorio al crear un turno especial, para que aparezca en el portal de esa persona.
- NO se vinculan automáticamente historias clínicas por coincidencia de DNI/email. Compartir contacto con un consultorio no concede acceso clínico.
- Relaciones de cuenta/contacto y datos del portal están aislados por usuario y consultorio.

### Avisos por email

- Correo transaccional de turnos preparado con **Resend**, independiente de los emails de Supabase Auth.
- Outbox privada: evento y aviso se guardan junto al turno; un fallo de email no deshace la reserva.
- Confirmación, reprogramación y cancelación; sin DNI, notas internas ni datos clínicos en el correo.
- Trabajadores con bloqueo, idempotencia del proveedor y hasta ocho intentos.
- Reintento diario por cron Vercel a las 12:00 UTC y botón **Procesar avisos pendientes**.
- Ese cron NO es un recordatorio previo a la consulta. No se implementaron recordatorios ni WhatsApp.
- Si falta proveedor/remitente, se informa que el aviso está pendiente, sin simular un envío.

## Pendientes para usar la reserva públicamente

1. La dueña debe entrar a **Agenda → Horarios**, seleccionar su cuenta, completar su nombre público, agregar franjas reales, revisar reglas y habilitar reservas.
2. Configurar Resend y un dominio/remitente verificado en Vercel:
   - `RESEND_API_KEY`
   - `NOTIFICATIONS_FROM_EMAIL`
   No llevan prefijo `VITE_`. Estas dos variables NO estaban configuradas en la última revisión. No se contrató ni activó ningún servicio de pago.
3. `APP_URL` ya se configuró en producción con el dominio del sitio.
4. `CRON_SECRET` ya se generó y configuró en producción, sin mostrar ni guardar su valor en este documento.
5. Revisar en Supabase Auth que Site URL sea el dominio de producción y que estén permitidas `/recuperar` y `/mis-turnos`. Configurar SMTP/límites apropiados para verificación de nuevos pacientes.

### Incidente previo: invitación dirigida a localhost

- El usuario recibió una invitación que terminaba en localhost, por Site URL/allowlist de Supabase.
- Se explicó que debe corregirse en:
  https://supabase.com/dashboard/project/yzqcvnqrwgkxpztpqmrt/auth/url-configuration
- Las claves disponibles administran usuarios/datos, pero NO la configuración del proyecto de Auth. No había `SUPABASE_ACCESS_TOKEN` de Management API.
- Nunca pedir que pegue tokens o URLs de invitación completas en el chat.
- La app reconoce tanto `type=invite` como `type=recovery` para mostrar elección de contraseña, incluso si Supabase vuelve a la raíz del sitio.
- Las dos cuentas administradoras terminaron confirmadas; no consta una verificación directa de la configuración Site URL/allowlist.

## Archivos principales

- `src/App.tsx`: sesión, resolución equipo/paciente y rutas protegidas.
- `src/pages/Auth.tsx`: login, registro, recuperación y reenvío de verificación.
- `src/pages/Team.tsx`: equipo y directorio de cuentas pacientes.
- `src/pages/Agenda.tsx`, `BookingSettings.tsx`: agenda interna y disponibilidad.
- `src/pages/Booking.tsx`, `ClientPortal.tsx`: reserva pública y portal.
- `src/pages/PatientEditor.tsx`, `Patients.tsx`: archivo clínico.
- `src/lib/booking.ts`: tipos, RPC, notificaciones y conversión de zona horaria.
- `src/lib/api.ts`, `model.ts`, `pdf.ts`, `supabase.ts`, `auth-links.ts`.
- `api/team.mjs`, `api/notifications.mjs`: funciones Vercel.
- `server/common.mjs`, `server/notifications.mjs`: validación servidor y envío.
- `vite.config.ts`: API local con middleware; variables privadas solo en el servidor.
- `vercel.json`: rutas SPA sin interceptar `/api/`, cabeceras y cron.
- `scripts/migrate-db.mjs`: migraciones transaccionales, checksum y CA TLS validada.
- `scripts/seed-admins.mjs`: comprobación/seeder idempotente, no cambia contraseñas ni mueve membresías entre consultorios.
- `scripts/check-deployment.mjs`: comprobación anónima de páginas y APIs, sin crear cuentas ni turnos.
- `README.md`: instalación, despliegue, seguridad y operación detallados.

## Base de datos y migraciones

Aplicadas en producción:

1. `supabase/migrations/202610210001_consultorio.sql`
2. `supabase/migrations/202610210002_booking.sql`

**NO editar estas migraciones aplicadas:** sus checksums se guardan en `private.app_migrations`. Crear una nueva migración para cambios posteriores.

Tablas principales: `clinics`, `clinic_members`, `patients`, `clinical_records`, `evolutions`, `clinical_record_versions`, `patient_accounts`, `clinic_client_accounts`, `booking_settings`, `booking_hours`, `appointments`, `appointment_events` y cola privada de notificaciones.

Las escrituras del navegador pasan por RPC con autorización. Pacientes no tienen acceso directo a turnos ajenos ni historias. Las funciones de servidor usan claves administrativas que nunca se exponen al frontend.

## Entorno y secretos

- `.env.local` contiene credenciales reales. Está ignorado por Git; **no mostrar, copiar ni incluir sus valores en respuestas o archivos de resumen**.
- Cliente acepta tanto `VITE_SUPABASE_*` como `VITE_PUBLIC_SUPABASE_*` (estos últimos los proporciona la integración Vercel).
- Public key preferida: `PUBLISHABLE_KEY`; también admite `ANON_KEY` JWT con rol anon.
- Nunca poner `SUPABASE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, contraseñas PostgreSQL o tokens en variables `VITE_`.
- `.env.example` tiene cambios del usuario; inspeccionarlo antes de reemplazarlo.
- La conexión PostgreSQL desde Windows agotaba el tiempo. La migración sí funcionó desde el build de Vercel, usando CA pública de Supabase con huella y vigencia verificadas. No desactivar TLS para sortearlo.

## Comandos y despliegue

```sh
npm run dev
npm run lint
npm test
npm run test:e2e
npm run build
npm run db:check -- --emails "axelfiol12@gmail.com,cielcycu@gmail.com"
npm run deployment:check -- https://historia-clinica-rouge.vercel.app
```

- Tests Vitest y Playwright limitados a dos workers para evitar agotar memoria en Windows.
- En Windows, Playwright usa Edge instalado.
- Las compilaciones normales NO migran, crean usuarios ni envían invitaciones.
- Para aplicar pendientes desde Vercel, solo en un despliegue expresamente autorizado:

```sh
npx --yes vercel deploy --prod --yes --scope minzakes-projects --build-env INITIALIZE_CONSULTORIO_DB=1
```

- Publicación normal:

```sh
npx --yes vercel deploy --prod --yes --scope minzakes-projects
```

- No hubo commits ni push. Hay numerosos archivos modificados/nuevos en el árbol de trabajo: son el desarrollo acumulado. **No resetear, limpiar ni descartar cambios.**

## Última verificación

- **84 pruebas automatizadas aprobadas**, 14 archivos de tests.
- **5 flujos Playwright aprobados**, incluidos paciente reserva/reprograma/cancela, dueño configura agenda/turno de 90 minutos/bloqueo/invitación, móvil e historias/PDF existentes.
- Lint y compilación correctos. Hay advertencia de tamaño de bundle, no un error de compilación.
- Supabase real: ambas cuentas owner activas/confirmadas; disponibilidad pública funciona y devuelve cero agendas abiertas; lectura anónima de `appointments` denegada con `42501`.
- Último despliegue READY y asociado al dominio de producción:
  `historia-clinica-ezgjq5dt7-minzakes-projects.vercel.app`.
- Esta máquina tuvo timeouts al dominio. Se verificó desde Vercel con `VERIFY_LIVE_APP=1`:
  - `/registro`: 200.
  - `/reservar`: 200.
  - POST `/api/team` sin sesión: 401 JSON.
  - POST `/api/notifications` sin sesión: 401 JSON.
- Las pruebas de escritura y correos usaron mocks/PGlite: no se enviaron emails de turnos ni se crearon registros ficticios en producción.

## Próximo paso sugerido

Pedir al usuario que pruebe **Usuarios**, **Agenda** y **Agenda → Horarios** con las cuentas reales. Resolver observaciones de uso. Para abrir reservas, configurar horarios reales y luego el proveedor de email. No asumir que desea agregar pagos, WhatsApp u otros módulos sin pedirlo.
