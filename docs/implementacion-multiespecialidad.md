# Base reutilizable aplicada en develop

La aplicación mantiene podología como único módulo clínico instalado. Esta entrega implementa la base de las etapas 1–3 del [plan](plan-multiespecialidad.md); no habilita una segunda especialidad ni crea centros, cuentas, horarios publicados o datos clínicos de ejemplo en servicios remotos.

## Cambios disponibles

- `src/core/` contiene identidad, formato y permisos compartidos. `src/modules/podologia/` contiene preguntas, validación, editor, adaptador y PDF. El registro de módulos rechaza identificadores y versiones desconocidos, también en el guardado SQL.
- Pacientes es el directorio administrativo. Una identidad puede existir antes de su historia; crear la ficha desde ese paciente reutiliza su UUID. Los datos sanitarios quedan en la ficha clínica, no en los datos accesibles a recepción.
- Las fichas tienen especialidad, versión de esquema, consultas y versiones inmutables. La identidad y la ficha tienen controles de concurrencia independientes. Una edición clínica con identidad desactualizada no pisa cambios administrativos.
- Una cuenta puede integrar varios consultorios. El selector aparece cuando corresponde; cambiar de centro confirma los cambios pendientes, desmonta el formulario anterior y vuelve al inicio. Las lecturas clínicas, versiones y exportaciones verifican el centro activo en el servidor.
- Administración, atención profesional y acceso clínico son capacidades separadas. Recepción gestiona identidad y turnos, sin historias ni notas privadas. Usuarios permite configurar lectura, escritura, exportación, alcance y perfil profesional. Asignar acceso otorga permisos a miembros con alcance asignado, dentro de sus capacidades máximas. Está disponible en la historia y en Pacientes: un administrador puede gestionar asignaciones sin abrir el contenido clínico. El directorio solo le entrega el identificador y especialidad necesarios para esa acción.
- Prestaciones define duración y estado. Cada agenda pública combina prestación, profesional y franjas/reglas propias. La prestación migrada conserva los 30 minutos; pueden crearse otras. Archivar una prestación cierra su disponibilidad nueva sin borrar turnos.
- Los enlaces públicos anteriores se preservan como alias al cambiar el identificador. Un alias reservado no puede usarse para otra agenda. Las reservas derivan su duración en el servidor y guardan contexto de prestación y reglas.
- La exclusión de turnos sigue siendo global por usuario profesional, incluso entre consultorios. El límite sigue siendo un turno futuro confirmado por paciente/profesional, contando sus prestaciones.
- Antes de descargar la historia actual se vuelve a consultar la autorización y versión en el servidor. Las versiones anteriores requieren autorización de exportación vigente. Los permisos presentes no quedan congelados en el snapshot histórico.

## Modelo y compatibilidad

| Datos | Fuente actual |
| --- | --- |
| Identidad y versión administrativa | `patients`, con `details` limitado a campos administrativos |
| Especialidades instaladas/habilitadas y esquemas | `specialties`, `specialty_schemas`, `clinic_specialties` |
| Acceso clínico y asignaciones | `member_specialties`, `clinical_access_grants`, `access_events` |
| Perfil de atención y matrícula | `clinic_practitioners`, `practitioner_specialties` |
| Fichas, consultas y snapshots | `clinical_charts`, `clinical_encounters`, `clinical_chart_versions` |
| Prestaciones y oferta pública | `services`, `practitioner_services`, `booking_pages`, `availability_rules`, `booking_page_aliases` |
| Reservas y notificaciones | `appointments`, `appointment_events`, outbox privada existente |

Las migraciones conservan UUID de pacientes/consultas, números de historia, versiones y snapshots originales. `clinical_records`, `evolutions` y `clinical_record_versions` quedan como legado conservado, sin lecturas desde cuentas de la aplicación ni escrituras clínicas nuevas. `save_patient_record` es un adaptador al escritor transaccional nuevo. La agenda original mantiene su representación de compatibilidad en `booking_settings`/`booking_hours`; las agendas adicionales viven en el modelo nuevo.

La migración no actualiza turnos antiguos para rellenar columnas: evita generar eventos o reenviar avisos por un cambio de estructura. El contexto de reservas antiguas se resuelve mediante las relaciones conservadas.

## Aplicación en un entorno de destino

1. Preparar copia y restauración comprobadas del proyecto real. Ensayar la actualización en un entorno aislado con datos autorizados y comparar IDs, conteos, contenido, versiones y exportaciones. Las pruebas locales usan únicamente datos sintéticos.
2. Coordinar la migración con el despliegue del frontend/API de esta rama. Evitar que clientes antiguos permanezcan editando durante la transición del modelo clínico.
3. Ejecutar `npm run db:migrate` en el proyecto de destino configurado, o aplicar los SQL pendientes en orden. Las migraciones nuevas son `202610210004_specialty_core.sql` y `202610210005_service_agendas.sql`. En una base vacía se ejecutan primero 001, 002 y 003. No modificar las migraciones ya aplicadas ni reiniciar tablas.
4. Desplegar frontend y API compatibles con ambos cambios. Una compilación normal no aplica SQL: el despliegue sin migraciones no puede usar estas pantallas nuevas.
5. Iniciar sesión con el equipo existente y verificar historias, versiones/PDF, directorio, agenda y reserva pública original. Revisar roles y perfiles reales antes de dar nuevas altas. Comprobar que recepción no pueda abrir historias ni notas privadas y que un profesional asignado solo vea las fichas concedidas.
6. Probar dos agendas y dos profesionales con pacientes de prueba autorizados; comprobar conflictos del mismo profesional entre centros y servicios, cancelación/reprogramación y notificaciones del entorno. La entrega local no configura SMTP ni acredita el funcionamiento de servicios remotos.

Las membresías existentes conservan explícitamente su acceso clínico de podología para evitar una revocación accidental durante la migración. Revisar esos permisos con el titular. Los nuevos administradores reciben administración, sin acceso clínico ni perfil de atención implícitos. Un titular que atiende debe habilitar sus capacidades y perfil desde Usuarios. Los nuevos profesionales tienen alcance asignado; pueden crear su ficha o recibir acceso a una existente. Recepción no recibe capacidades clínicas.

Para asignar una cuenta existente a otro centro sin alterar sus membresías anteriores, el seeder admite `--clinic-id UUID`. No crea un consultorio nuevo cuando ya hay varios y la elección es ambigua.

## Reversión y límites

Las tablas antiguas conservadas no reciben los nuevos guardados clínicos. Después de escribir en el modelo nuevo, volver al frontend/escritor anterior requiere conversión inversa o una versión compatible probada. Restaurar una copia anterior descartaría guardados posteriores. No eliminar fichas/consultas nuevas ni reproducir eventos de notificación para revertir una pantalla.

La matrícula actual es una cadena por profesional/especialidad. Se conserva el autor real de cada guardado, pero aún falta una interfaz para declarar el profesional tratante por consulta y credenciales por jurisdicción. Los registros antiguos no reciben autores o matrículas inventados. Los snapshots nuevos conservan la configuración de exportación del centro; esta entrega no incorpora firma electrónica ni certificación profesional.

Para una segunda especialidad se necesitan su ficha, validación SQL, editor, PDF, registro de esquema/módulo y pruebas acordadas con un profesional. Insertar solo una fila de catálogo no la vuelve operativa. Sedes, salas, equipamiento compartido, resumen interdisciplinario y filtros por esas dimensiones quedan para las siguientes etapas del plan.

La [propuesta de odontología](propuesta-odontologia.md) define una ficha para adultos y niños con odontograma por paciente, dentición permanente/temporal/mixta y controles fechados. Incluye una [maqueta interactiva](prototipo-odontograma.html) de carga y versiones de prueba; todavía no instala el módulo ni guarda datos clínicos reales.

## Verificación local

```sh
npx vitest run --maxWorkers=1
npx playwright test --workers=1
npm run lint
npm run build
```

Las pruebas SQL ejecutan migraciones desde el esquema anterior sobre PGlite, verifican checksums/repetición/rollback, preservación del legado, permisos, concurrencia de versiones y reglas de reserva. Las pruebas de navegador usan endpoints simulados e incluyen recepción móvil, cambio de consultorio con formulario pendiente, ficha de un paciente administrativo y creación de prestación/agenda. No reemplazan la validación de Supabase Auth, permisos del proyecto remoto, email y despliegue de destino.
