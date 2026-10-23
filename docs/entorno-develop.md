# Entorno de pruebas de develop

Preparado el 22 de octubre de 2026.

- Aplicación: https://historia-clinica-git-develop-minzakes-projects.vercel.app
- Rama: `develop`.
- Proyecto Supabase: `historia-clinica-develop`, referencia `mhddieetrmniazjrrkzg`, región `sa-east-1`.
- Organización: `Minzake's Org`, independiente de la integración Supabase de producción en Vercel.
- Migraciones instaladas: 001, 002, 003, 004 y 005. Se registran en `private.app_migrations` con su checksum.
- Base creada vacía, sin importar pacientes, turnos, usuarios ni contraseñas desde producción. Se creó expresamente una cuenta de acceso para el administrador de pruebas.

## Acceso

La cuenta `axelfiol12@gmail.com` administra el consultorio de pruebas y tiene capacidades clínicas de podología y perfil profesional habilitados para evaluar el sistema. Su contraseña es independiente de producción. Desde el login, usar **¿Olvidaste tu contraseña?** para definirla mediante el correo de recuperación. La preparación no envió invitaciones ni mensajes de recuperación.

Las reservas públicas empiezan cerradas y sin franjas de atención. Los pacientes y turnos que se creen aquí deben ser ficticios. El aviso **Entorno de pruebas** identifica esta aplicación.

El proyecto nuevo usa el servicio de correo predeterminado de Supabase; no se copió una configuración SMTP ni una clave de email de producción. El correo de Auth depende de sus destinatarios permitidos y límites. Los avisos transaccionales de turnos permanecen sin configurar; guardar un turno no acredita el envío de un email.

## Separación de entornos

Las variables específicas de Vercel usan `target: preview` y `gitBranch: develop`. Incluyen las URL y claves de Supabase, las tres URL PostgreSQL y `APP_URL`. Prevalecen sobre los valores Preview generales del proyecto. Las variables y el despliegue de producción conservan su configuración.

`VITE_APP_ENVIRONMENT=develop` muestra el aviso de pruebas. El valor heredado de `SUPABASE_JWT_SECRET`, que la aplicación no utiliza, queda vacío en esta rama; los servicios usan las claves propias del proyecto nuevo.

Cada nuevo despliegue de `develop` recibe estas variables. Los despliegues Preview anteriores conservan la configuración con la que se compilaron: usar el enlace estable de arriba para abrir la versión actual. Otras ramas Preview no reciben automáticamente esta base separada.

Para desarrollo local se creó `.env.develop.local`, ignorado por Git, con las credenciales independientes. Usar:

```sh
npm run dev -- --mode develop
```

No compartir ni agregar ese archivo al repositorio. `.env.local` conserva la configuración anterior; los comandos que lo cargan explícitamente siguen apuntando al proyecto anterior.

## Migraciones posteriores

Una compilación normal no aplica SQL. Para ejecutar el migrador sobre pruebas, cargar explícitamente su archivo y comprobar antes la referencia de proyecto de las URL:

```sh
node --env-file=.env.develop.local scripts/migrate-db.mjs --apply
```

En esta máquina la conexión directa PostgreSQL puede no estar disponible. Como alternativa, usar el SQL Editor o la Management API del proyecto **mhddieetrmniazjrrkzg**, conservando el registro transaccional de migraciones. No ejecutar el comando habitual `npm run db:migrate` suponiendo que la rama Git elige la base: ese comando carga `.env.local`.

Los archivos SQL tienen finales de línea LF fijados en `.gitattributes`, de modo que sus checksums coincidan en Windows y Linux. No editar migraciones aplicadas; agregar una nueva.
