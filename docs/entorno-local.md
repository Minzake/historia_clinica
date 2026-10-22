# Entorno local de pruebas

La web, PostgreSQL, Supabase Auth, Studio y el buzón de correo se ejecutan en esta máquina. No necesita Supabase Pro. Docker conserva la base local entre reinicios.

## Abrir y detener

Con Docker Desktop funcionando, desde el proyecto:

```sh
npm run local
```

| Servicio | Dirección |
| --- | --- |
| Aplicación | http://localhost:5173 |
| Supabase Studio | http://127.0.0.1:54323 |
| Buzón de correo local | http://127.0.0.1:54324 |
| API Supabase | http://127.0.0.1:54321 |
| PostgreSQL | `127.0.0.1:54322` |

El primer arranque descarga los contenedores. El comando prepara la red local, arranca Supabase, verifica que los puertos publicados estén ligados explícitamente a `127.0.0.1`, aplica únicamente migraciones pendientes, genera `.env.testing.local` y abre el servidor Vite en modo `testing`, con las APIs de equipo y notificaciones en el mismo puerto.

Algunas versiones de Docker Desktop no respetan el binding predeterminado de la red. En ese caso el script recrea exclusivamente los contenedores identificados con el proyecto `historia-clinica-local`, reutiliza sus volúmenes, configuración y alias, fija los puertos a loopback y espera a que estén saludables. No elimina volúmenes ni modifica contenedores de otras aplicaciones.

Cerrar el servidor Vite con `Ctrl+C`. Para detener los contenedores de este proyecto conservando sus datos:

```sh
npm run local:stop
```

`npm run local:setup` prepara solo los servicios, datos y variables, sin iniciar la web. No usar `supabase db reset`, `--no-backup` ni eliminar volúmenes para arrancar normalmente. Los contenedores de otros proyectos no se detienen.

## Cuentas y pacientes

En esta máquina se copiaron una vez las **dos cuentas activas del equipo** desde producción, con sus identificadores y hashes de contraseña, mediante la API administrativa local. Se verificó la igualdad de los hashes sin registrar contraseñas ni hashes en logs o archivos de exportación. Se asignaron sus roles en un consultorio local de pruebas. No se copiaron pacientes, historias, turnos, sesiones, tokens ni claves del proyecto remoto.

Se puede iniciar sesión inicialmente con los mismos correos y contraseñas del equipo. Los cambios posteriores son independientes: modificar una contraseña o un permiso local no modifica producción, y los cambios remotos no se sincronizan solos. Para probar recuperación, usar **¿Olvidaste tu contraseña?** y abrir el mensaje en el buzón local, sin esperar un email externo.

Una instalación nueva en otra máquina no importa cuentas remotas automáticamente. Si el consultorio local no tiene miembros, el script crea `admin@consultorio.test`, sin contraseña predeterminada: definirla por recuperación desde el buzón local. Si ya hay miembros, se conservan sin crear administradores adicionales ni restablecer sus permisos. La opción `--no-demo-user` omite esa cuenta inicial.

La agenda pública empieza cerrada, sin días/horarios inventados. Quien deba atender puede habilitar su perfil desde **Usuarios → Acceso clínico** y configurar sus horarios. Crear pacientes ficticios para las pruebas.

## Correo y aislamiento

Los correos de registro, recuperación e invitación de Supabase Auth terminan en Mailpit, el buzón local del puerto 54324. No se envían a destinatarios externos. Los avisos transaccionales de turnos mediante Resend están deshabilitados en este entorno; el guardado y la cola pueden probarse, pero no se acredita entrega externa.

`.env.testing.local` contiene solo los datos generados por `supabase status` local y está ignorado por Git. El modo `testing` rechaza URL Supabase remotas, conexiones PostgreSQL fuera de `54322`/loopback y credenciales activas de envío externo. La web muestra **Entorno local de pruebas**. Los servicios quedan ligados a `127.0.0.1`; estas direcciones sirven en esta computadora, no como enlace público para otra persona o un celular.

Los comandos `npm run dev` y `npm run db:migrate` conservan su comportamiento previo y pueden cargar `.env.local`. Para estas pruebas usar `npm run local` y `npm run local:setup`, que no toman la configuración remota como destino.

## Migraciones y mantenimiento

El migrador existente registra checksums en `private.app_migrations`; `supabase/config.toml` deshabilita la aplicación paralela de migraciones y seeds por la CLI para mantener un único escritor. Los cinco SQL iniciales se aplicaron sin cambios. Agregar nuevas migraciones, sin modificar las ya aplicadas, y volver a ejecutar `npm run local:setup`.

La configuración `supabase/config.toml` de esta entrega está destinada al entorno local. Una futura integración Supabase Branching/CI debe acordar su migrador, seeds y configuración remota antes de activarla.

## Probar las mejoras de agenda

En **Agenda → Horarios**, el enlace interno largo se reemplaza por una propuesta legible basada en la prestación y la profesional. **Personalizar enlace** permite elegir otro nombre. Guardar la disponibilidad activa el nuevo nombre y habilita **Copiar enlace**; los enlaces anteriores se conservan como alias. Los nombres que ya estaban personalizados se mantienen. Estos cambios usan las funciones de la migración 005 y no requieren una migración adicional.

En **Nuevo turno**, completar el paciente o buscarlo por nombre/DNI, elegir día, horario y duración y guardar. La profesional se selecciona automáticamente si hay una sola habilitada. Los horarios sugeridos excluyen turnos y bloqueos registrados y consideran la duración elegida; se pueden ingresar otros horarios manualmente. Para la prestación/profesional de la agenda configurada se usan sus franjas; en otros casos se sugieren horas entre las 9 y las 18, indicado en pantalla. La base conserva la protección final contra reservas simultáneas, incluso en otros consultorios.

La vista semanal permite **Agregar turno** desde cada día. Los datos de contacto y las observaciones son opcionales; el estado se modifica al editar un turno existente. Buscar un paciente administrativo solo completa sus datos: la vinculación con una cuenta del portal se hace de forma explícita mediante **Usar una cuenta del portal de pacientes**.
