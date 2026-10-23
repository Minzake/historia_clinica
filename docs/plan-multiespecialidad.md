# Evolución hacia otras especialidades y policonsultorio

Estado: base modular y etapas 1–3 implementadas en `develop`. Podología sigue siendo el único módulo instalado. La segunda especialidad y las sedes/salas requieren trabajo posterior.

Base revisada: `develop`, commit `12e7009`, después de integrar sus mejoras a `main`.

## Objetivo y alcance actual

Mantener el consultorio de podología operativo y permitir, gradualmente:

1. Reutilizar la aplicación en un consultorio independiente de otra especialidad.
2. Operar un policonsultorio con varias especialidades y profesionales dentro de una misma organización.
3. Incorporar sedes y recursos compartidos cuando exista una necesidad real.

Por ahora solo está habilitada podología. La [implementación y puesta en marcha](implementacion-multiespecialidad.md) describe los cambios concretos de formularios, permisos, datos y agendas. Las migraciones se ensayaron con datos sintéticos; todavía requieren aplicación y validación en el entorno de destino. No se definen requisitos clínicos de especialidades que todavía no fueron elegidas.

## Avance aplicado

- Etapa 0: diagnóstico y regresión automatizada con datos sintéticos completos. Quedan pendientes el backup y el ensayo de restauración del entorno real antes de migrarlo.
- Etapa 1: módulo `podologia` separado, registro de módulos, adaptadores y PDF propios.
- Etapa 2: identidad administrativa separada, fichas y versiones por especialidad, recepción y permisos clínicos explícitos por miembro/ficha.
- Etapa 3: múltiples membresías, perfiles profesionales, prestaciones y agendas públicas independientes; la prestación original conserva 30 minutos. Se preserva la ocupación global por profesional y los enlaces anteriores.
- Etapas 4 y 5: pendientes de elegir y validar la segunda especialidad; no hay gestión de sedes, salas ni equipamiento exclusivo.

Los apartados de diagnóstico describen la base previa (`12e7009`). Las decisiones y criterios siguientes siguen siendo la referencia para completar las etapas futuras. El perfil profesional actual admite una matrícula por especialidad; varias jurisdicciones y la identificación explícita del tratante por consulta todavía necesitan diseño e interfaz. No se atribuyen consultas antiguas a un profesional supuesto.

Propuesta: mantener una sola aplicación modular sobre React, Supabase y las APIs existentes. Separar responsabilidades dentro del proyecto y de la base de datos; los objetivos actuales no requieren microservicios, repositorios por especialidad ni un constructor genérico de formularios.

## Diagnóstico del sistema existente

| Área | Evidencia en el proyecto | Límite para crecer |
| --- | --- | --- |
| Organización | `clinics` y `clinic_id` en tablas y RPC | Ya existe aislamiento entre consultorios; falta distinguir organización de sede y sala física. |
| Equipo | `clinic_members.user_id` es clave primaria; `getMembership()` usa `maybeSingle()` | Una cuenta profesional no puede pertenecer a varios consultorios. `owner` mezcla administración y acceso clínico. |
| Pacientes | `patients` tiene identidad, número de historia y `details` | Los datos administrativos y parte de la ficha clínica están mezclados. El DNI no vacío y el número son únicos por consultorio. |
| Historias | `clinical_records.patient_id` es clave primaria; evoluciones y versiones dependen del paciente | Solo hay una ficha por paciente, sin especialidad ni versión explícita de plantilla. |
| Módulo clínico | `model.ts`, `PatientEditor.tsx`, `pdf.ts` y RPC de guardado | Preguntas, validaciones y planillas contienen reglas y textos específicos de podología. Separar solo el frontend sería insuficiente. |
| Reservas | `booking_settings.clinic_id` es clave primaria y configura una `provider_id` | La agenda interna admite varios profesionales, pero la configuración pública tiene una sola profesional por consultorio. |
| Duración | `BookingPage.duration_minutes: 30`, generación de horarios y RPC | Los 30 minutos están fijados en varias capas; los turnos internos ya admiten otras duraciones. |
| Seguridad | RLS clínica basada en `private.is_member(clinic_id)` | Un miembro del equipo tiene acceso clínico al consultorio completo. No hay alcance por especialidad ni recepción sin acceso clínico. |
| Concurrencia | Exclusión por `provider_id` y rango de tiempo; control de versión y límite de reservas | Son protecciones existentes que deben conservarse, incluso cuando un profesional trabaje en varios lugares. |
| Portal | `patient_accounts`, `clinic_client_accounts` y vínculos explícitos de reservas | Ya separa cuenta de paciente y ficha clínica. Esa separación debe mantenerse. |

Fuentes principales: [modelo](../src/lib/model.ts), [API clínica](../src/lib/api.ts), [agenda y reservas](../src/lib/booking.ts), [contexto](../src/context.ts), [rutas y sesión](../src/App.tsx), [equipo](../api/team.mjs) y [migraciones](../supabase/migrations/).

## Decisiones propuestas

### Una organización puede tener varias especialidades

Conservar `clinics.id` y `clinic_id` como frontera de aislamiento. Un policonsultorio será una sola organización con varias especialidades habilitadas. Un consultorio independiente seguirá teniendo su propio `clinic_id`, aunque use el mismo módulo clínico que otro.

Una sede representa un lugar de atención; una sala representa un recurso dentro de una sede. No usar una fila de `clinics` por especialidad o por sala: eso fragmentaría artificialmente al paciente y al equipo de un mismo policonsultorio.

No hace falta renombrar todas las tablas a `organizations` para lograr esta separación. La interfaz puede decir «Consultorio» o «Centro» según la configuración, conservando identificadores y vínculos existentes.

### Identidad del paciente compartida; contenido clínico con acceso propio

Dentro de cada organización, un paciente tendrá una identidad administrativa y podrá tener una ficha longitudinal por especialidad. Inicialmente se propone una ficha por combinación paciente/especialidad; si después hacen falta episodios independientes, se agregarán sin duplicar al paciente.

Ejemplo futuro: Ana tiene un único registro administrativo en el centro, una ficha de podología y otra de la segunda especialidad. Recepción puede gestionar sus datos de contacto y turnos autorizados. Cada profesional ve las fichas para las que tiene permiso. El número de historia actual permanece como identificador del paciente dentro del consultorio; cada ficha agrega su identificador propio.

Dos organizaciones diferentes no comparten pacientes ni historias por tener el mismo DNI. Tampoco se vincula automáticamente una cuenta del portal con una ficha por coincidencia de DNI o email. Cualquier asociación clínica futura será explícita, verificada y auditada.

Antecedentes, medicación y consentimientos son contenido clínico, aunque puedan ser útiles a varias especialidades. No moverlos automáticamente a la ficha administrativa. Un resumen clínico compartido sería una función posterior, con permisos, procedencia, fecha de revisión y alcance definidos.

Al separar el formato actual, nombre, DNI, nacimiento y contacto pertenecen a la identidad administrativa; la fecha de apertura, la edad calculada para esa fecha y las respuestas clínicas pertenecen a la ficha. El número de historia conserva su alcance por paciente/centro. La autorización fotográfica actual mantiene su alcance registrado y no se convierte en autorización general para otras especialidades.

### Cada especialidad aporta un módulo versionado

El núcleo administra identidad, organización, permisos, equipo, agenda, notificaciones y auditoría. Cada módulo clínico aporta:

- Identificador estable de especialidad, por ejemplo `podologia`.
- Plantillas y versiones de datos que sabe leer y editar.
- Formulario inicial, registro de consultas y reglas clínicas de validación.
- Validación autoritativa de guardado en el servidor o los RPC transaccionales.
- Exportaciones PDF, ayudas y pruebas propias.

Contrato orientativo: `SpecialtyModule` con `id`, versiones soportadas, creación del borrador, editor, validación y exportación. La forma exacta se definirá al extraer podología; no se debe publicar una interfaz clínica universal antes de tener un segundo caso real.

El núcleo debe poder listar fichas y verificar permisos sin interpretar su contenido. Los datos clínicos pueden conservarse como JSON estructurado, pero siempre con especialidad, versión y validación explícitas. No aceptar un JSON libre ni confiar en un nombre de especialidad enviado por el navegador para elegir permisos.

Las versiones históricas conservan la plantilla y el esquema con los que se guardaron. Cambiar una etiqueta de una pregunta no cambia su identificador. La base, el frontend y la exportación deben interpretar la misma versión; se conservará la lectura de versiones anteriores.

### Administración y práctica clínica son capacidades distintas

Separar al menos las capacidades de administrar el centro, gestionar equipo, gestionar agenda, acceder a identidad administrativa, leer fichas, escribir consultas y exportar contenido clínico. El permiso de lectura o exportación debe comprobarse también en RPC, RLS, búsquedas, estadísticas y versiones anteriores.

| Perfil futuro | Acceso propuesto |
| --- | --- |
| Administración técnica | Configuración y equipo. El acceso clínico requiere una asignación adicional explícita. |
| Titular que también atiende | Administración más las asignaciones clínicas que correspondan. |
| Profesional | Especialidades habilitadas y fichas autorizadas; edición de sus consultas según la política definida. |
| Recepción | Identidad administrativa y agenda autorizada, sin antecedentes, evoluciones, PDF clínico ni notas clínicas internas. |
| Paciente | Su cuenta y reservas. No obtiene acceso a la historia por registrarse. |

La asignación de una especialidad a un profesional establece su habilitación, pero no debe conceder acceso ilimitado a todos sus pacientes por accidente. Propuesta para el policonsultorio: especialidad habilitada más asignación a la ficha/equipo tratante o una concesión explícita. El acceso de toda una especialidad podrá configurarse como política del centro si se decide adoptarlo.

La configuración actual de `owner` y `professional` se conserva durante la extracción inicial. Antes de activar el nuevo modelo se relevarán sus accesos y se migrarán a concesiones explícitas, incluyendo a los titulares que hoy atienden. No aplicar una conversión silenciosa que deje al consultorio sin acceso a sus historias. Mantener la protección del último administrador.

### Una prestación define qué se reserva

Separar especialidad, profesional y prestación. Una prestación define la atención ofrecida, duración y reglas públicas. Un mismo profesional puede ofrecer varias prestaciones o trabajar en más de una especialidad.

Para podología se conserva inicialmente la consulta web de 30 minutos y los turnos especiales internos actuales. La segunda especialidad tendrá duraciones y reglas propias cuando se definan. La base calcula duración y profesional habilitado desde la configuración vigente; no confía en la duración solicitada por el navegador.

La disponibilidad se calcula con la intersección de horario profesional, prestación habilitada, sede/recurso si aplica, anticipación y ocupaciones. Agregar una prestación no crea capacidad extra: el mismo profesional no puede atender dos consultas simultáneas por ofrecer servicios distintos.

Mantener por defecto el límite actual de un turno futuro confirmado por paciente y profesional, incluso si el profesional tiene varias especialidades. Cambiarlo a un límite por prestación o especialidad requiere una decisión de negocio y su correspondiente control transaccional.

## Modelo de datos objetivo, orientativo

Estos nombres describen responsabilidades; no son migraciones listas para ejecutar. Las tablas existentes pueden ampliarse o adaptarse cuando corresponda.

| Entidad | Propósito y relaciones |
| --- | --- |
| `clinics` | Organización actual y frontera de aislamiento. Conserva su UUID. |
| `specialties` / `clinic_specialties` | Catálogo estable y especialidades habilitadas por organización. Podología es la única habilitada inicialmente. |
| `clinic_members` | Membresía por `(clinic_id, user_id)` con estado y capacidades; deja de limitar globalmente al usuario a un consultorio. |
| `clinic_practitioners` / `practitioner_specialties` / `practitioner_credentials` | Perfil profesional por organización, nombre público, especialidades habilitadas y matrículas según especialidad/jurisdicción. No confundirlo con ser administrador ni presentar una matrícula cargada como verificada automáticamente. |
| `patients` | Identidad y datos administrativos por organización, conservando DNI, UUID y número existentes. |
| `clinical_charts` | Ficha por organización, paciente y especialidad; esquema, versión y estado propios. |
| `clinical_encounters` | Consultas asociadas a una ficha, con autoría y profesional tratante diferenciados; vínculo opcional con turno. |
| `clinical_chart_versions` | Versiones inmutables y esquema de cada snapshot. Los snapshots anteriores siguen disponibles. |
| `clinical_access_grants` | Alcance de acceso clínico para miembros/equipos y fichas, con trazabilidad. |
| `services` / `practitioner_services` | Prestaciones por especialidad y profesionales que pueden realizarlas. |
| `booking_pages` / `availability_rules` | Publicación y horarios por oferta profesional/prestación; se adaptan las reglas actuales. |
| `appointments` | Mantiene UUID, versiones y auditoría; agrega referencias a prestación y, cuando corresponda, sede/recurso. |
| `locations` / `resources` / `resource_reservations` | Sedes, salas/equipamiento y sus ocupaciones, al implementar el policonsultorio físico. |

Reglas que deben acompañar al modelo:

1. Todas las relaciones clínicas y administrativas se validan contra la misma organización mediante claves compuestas y autorización del servidor. Una FK al UUID aislado no basta para impedir referencias cruzadas.
2. Cada ficha referencia una especialidad habilitada y cada prestación un módulo y profesional compatibles. Deshabilitar una especialidad impide nuevas operaciones, pero mantiene el acceso autorizado a su historial.
3. La versión del paciente administrativo, la de cada ficha y la de cada turno son independientes. Editar una ficha no sobrescribe simultáneamente la identidad administrativa cargada por otra persona.
4. Una prestación puede archivarse, sin borrar turnos ni versiones. Turnos y avisos conservan los datos necesarios para entender la reserva histórica aunque cambie su nombre o duración.
5. Mantener una identidad estable del profesional para detectar ocupación entre sedes y organizaciones. Hoy `provider_id` es el usuario y la exclusión es global por profesional: no agregar `clinic_id` a esa exclusión, ni sustituirla por IDs distintos por sede, permitiendo dobles reservas. Un conflicto externo no debe revelar nombres ni datos del otro consultorio.
6. Si una consulta usa una sala o equipo exclusivo, todas las reservas de profesional y recursos se adquieren en la misma transacción. Un fallo revierte todo; un bloqueo puede ocupar profesional, sala o ambos según su alcance.
7. Toda consulta de historial, PDF, búsqueda y métrica respeta los mismos permisos. Que una ficha esté oculta en la navegación no constituye protección.
8. Los nuevos documentos clínicos distinguen quién realizó la atención de quién guardó o corrigió el registro. Guardan la identificación profesional y del centro necesaria para reproducir su exportación; una matrícula única en la configuración general deja de representar a todo el equipo. Para versiones antiguas sin esos metadatos no se inventa una identidad histórica.

## Experiencia de uso futura

- Con una sola especialidad y una sola organización, se conserva el recorrido actual, sin selectores vacíos ni pasos adicionales.
- Con varias organizaciones asignadas a una cuenta, se ofrece un selector de centro. El servidor vuelve a verificar el contexto en cada operación y se invalidan las cachés, solicitudes pendientes y formularios del centro anterior. No persistir contenido clínico en el navegador.
- En un policonsultorio, buscar al paciente una sola vez. Su ficha muestra datos administrativos y únicamente las especialidades autorizadas; abrir una ficha elige el editor correspondiente.
- La agenda permite filtrar por especialidad, profesional y sede, con una vista de recepción limitada a datos administrativos.
- La reserva pública muestra prestación, profesional disponible y ubicación. Si solo hay una opción, se selecciona automáticamente; antes de confirmar se muestra el resumen completo y las reglas aplicables.
- Los enlaces actuales `/reservar/:slug`, las historias y las versiones antiguas conservan un destino válido. No reutilizar un enlace antiguo para una prestación distinta.

## Hoja de ruta y criterios de salida

| Etapa | Entrega | Criterio para darla por terminada |
| --- | --- | --- |
| 0. Línea de base | Inventario de datos, reglas, permisos, RPC, PDFs y pruebas; copia y ensayo de restauración antes de migrar datos reales. | Se puede comparar y recuperar el comportamiento y los registros previos. Este documento cubre el diagnóstico de código, no acredita un backup ni una restauración real. |
| 1. Extraer podología | Separar identidad, módulo clínico, exportación y componentes compartidos; registro de módulos con solo podología. Mantener temporalmente los DTO y RPC existentes mediante un adaptador. | Los formularios, PDFs, guardados, IDs y enlaces actuales mantienen su comportamiento y pasan las pruebas existentes. No requiere habilitar funciones nuevas. |
| 2. Fichas y permisos explícitos | Añadir especialidad y esquema versionado; separar datos administrativos/fichas/consultas; incorporar concesiones clínicas y perfil de recepción. | Migración ensayada y autorizaciones probadas en cada vía de acceso. Podología sigue siendo la única especialidad visible. |
| 3. Profesionales y prestaciones | Varias membresías por cuenta, perfiles profesionales, servicios y disponibilidad por oferta; compatibilidad con enlaces actuales. | Dos profesionales tienen agendas independientes y una misma persona no se superpone entre prestaciones o consultorios. La reserva de podología sigue durando 30 minutos. |
| 4. Validar una segunda especialidad | Elegir un caso real, acordar su ficha con un profesional, implementar módulo y pruebas propias. Puede comenzar en un consultorio independiente. | Se agrega el segundo módulo sin duplicar aplicación, autenticación, agenda ni sistema de permisos, y sin agregar condiciones de especialidad en todo el núcleo. |
| 5. Activar policonsultorio | Varias especialidades en una organización, asignación clínica, recepción, agenda conjunta y recursos compartidos. Añadir sedes si realmente se necesitan. | Un paciente tiene fichas independientes, el acceso cruza especialidades solo cuando se concede, y las reservas concurrentes no duplican profesional ni sala. |

Dependencias: la etapa 1 precede a la migración clínica; las etapas 2 y 3 son requisitos para abrir la segunda especialidad al público. La etapa 5 exige validar antes el segundo módulo. No estimar fechas hasta dimensionar datos existentes, segunda especialidad y alcance operativo.

### Primer conjunto de cambios recomendado

Empezar por la etapa 1 en PRs pequeños y revisables:

1. Separar tipos de identidad administrativa de los tipos clínicos actuales, conservando un adaptador para el formato guardado.
2. Mover reglas, preguntas y creación de borradores a `src/modules/podologia/`. Mantener iguales IDs, etiquetas y límites actuales.
3. Extraer el editor y el PDF de podología detrás del contrato de módulo. Mantener los controles de formulario y utilidades comunes fuera del módulo.
4. Hacer que las rutas resuelvan el módulo configurado, inicialmente fijo en podología. Añadir pruebas de que un identificador desconocido no abre un editor genérico ni permite guardar un esquema no soportado.

Organización orientativa:

```text
src/core/                 identidad, permisos y contexto del centro
src/features/            pacientes administrativos, agenda, equipo y portal
src/modules/podologia/   modelo clínico, validación, editor y PDF
src/modules/registry.ts  módulos y versiones admitidos
src/components/          controles y componentes compartidos
```

La validación SQL actual se mantiene durante esa extracción. Su separación por versión se realiza en la etapa 2 mediante migraciones nuevas, junto con la autorización correspondiente.

## Estrategia de migración y compatibilidad

1. **Ampliar antes de sustituir.** Crear tablas, columnas, funciones y permisos nuevos mediante migraciones pendientes. No editar las tres migraciones existentes ni borrar y reconstruir tablas para actualizar.
2. **Identificar el legado.** Asociar cada ficha actual al módulo `podologia`, esquema inicial documentado y misma organización. Preservar UUID de paciente, DNI, número de historia, consultas, versiones y enlaces.
3. **Clasificar los datos.** Extraer a la ficha administrativa solamente los campos acordados como administrativos. Mantener cuestionarios, medicación, hábitos y consentimiento en el módulo clínico. Reconciliar datos que hoy están repartidos entre `patients.details` y `clinical_records`.
4. **Preservar la historia original.** Conservar snapshots anteriores sin reescribirlos; un adaptador de lectura interpreta su formato. No inventar profesional tratante para consultas históricas: quién guardó una versión completa no prueba quién realizó cada atención. Los metadatos desconocidos quedan identificados como tales.
5. **Verificar la transformación.** Comparar conteos, identificadores y contenido por paciente/consulta/versión; revisar exportaciones y probar restauración en un entorno aislado. No copiar datos clínicos reales a fixtures, capturas o logs de desarrollo.
6. **Transicionar con un escritor definido.** Usar un adaptador transaccional o una ventana controlada para cada centro. Evitar escrituras independientes simultáneas al modelo antiguo y nuevo. Si la migración trabaja con el sistema abierto, comprobar versiones, reintentar conflictos y reconciliar antes de activar el nuevo escritor.
7. **Habilitar por centro.** Activar lectura y escritura nuevas primero para podología. La habilitación de otra especialidad es una operación distinta; no abre horarios ni envía avisos automáticamente.
8. **Planificar la vuelta atrás.** Antes de nuevas escrituras puede desactivarse la nueva lectura. Después de escribir en el modelo nuevo, volver al código anterior solo es seguro con compatibilidad o conversión inversa comprobada; no basta con restaurar una pantalla anterior. Preservar las nuevas consultas y evitar reenviar notificaciones ya emitidas.
9. **Retirar lo antiguo después.** Eliminar compatibilidad solo cuando todos los centros hayan migrado y las lecturas históricas/exportaciones estén cubiertas. La retirada merece su propia migración y revisión.

La cola de notificaciones conserva idempotencia y separación respecto al guardado del turno. La migración no debe crear eventos nuevos para reservas que solo están cambiando de estructura.

## Verificación que acompañará cada etapa

- **Regresión de podología:** crear, editar, guardar, reabrir y exportar ficha/evoluciones; versiones anteriores, conflictos de edición y validaciones actuales. Mantener firma en papel y autorización fotográfica con su significado actual.
- **Aislamiento:** mismo DNI en organizaciones diferentes; acceso denegado entre centros y entre especialidades sin concesión; probar tanto tablas/RLS como todos los RPC, APIs, búsquedas, métricas y versiones/PDF.
- **Roles:** administración sin permiso clínico, titular que atiende, profesional asignado, recepción y paciente. Suspensión y revocación deben surtir efecto en el servidor aunque haya una pantalla abierta.
- **Concurrencia clínica:** dos profesionales editando fichas diferentes del mismo paciente; edición simultánea de identidad y de ficha; un conflicto no sobrescribe otra versión.
- **Concurrencia de agenda:** profesionales distintos simultáneos, mismo profesional entre servicios/sedes/centros, sala exclusiva, bloqueos y dos solicitudes para el último horario. Confirmar rollback completo y no divulgación de datos del otro centro.
- **Plantillas:** lectura/exportación de esquemas viejos; rechazo de versiones desconocidas y de payloads de otra especialidad; archivo de un módulo sin pérdida de su historial.
- **Migraciones:** base vacía y base existente con datos sintéticos representativos; aplicación repetida controlada, reconciliación y retorno compatible tras nuevas escrituras.
- **Interfaz:** modo de una sola especialidad sin pasos extra, selección de centro con cambios pendientes, agendas filtradas y flujos móviles del profesional, recepción y paciente.

Mantener las pruebas actuales como base; no asumir que aprobarlas demuestra los escenarios futuros, que todavía requieren nuevas pruebas de módulos, permisos y migraciones.

## Decisiones pendientes antes de las funciones correspondientes

| Decisión | Propuesta inicial | Se necesita antes de |
| --- | --- | --- |
| Segunda especialidad | Elegir una real y relevar su ficha; no usar odontología u otra como requisito supuesto. | Etapa 4. |
| Acceso clínico compartido | Especialidad habilitada más asignación a ficha/equipo; compartir explícitamente. | Diseñar permisos de etapa 2. |
| Administración clínica | Capacidades administrativas separadas de las clínicas, con transición explícita de usuarios actuales. | Activar permisos de etapa 2. |
| Numeración | Conservar número de paciente por centro; identificadores propios de ficha y consulta. | Migrar fichas en etapa 2. |
| Límite de reservas | Conservar uno futuro por paciente y profesional, contando todos sus servicios. | Publicar servicios en etapa 3. |
| Ubicaciones y recursos | Una sede implícita al principio; salas y equipamiento solo si deben reservarse. | Etapa 5. |
| Contenido clínico compartido | Sin resumen compartido automático; definir campos, procedencia y permisos antes de incorporarlo. | Cualquier vista interdisciplinaria. |

Pagos, WhatsApp, teleconsulta, recetas, firma electrónica, integraciones externas y un editor visual de plantillas quedan fuera de este plan. Podrán evaluarse como necesidades propias; no son requisitos para reutilizar el sistema por especialidad.
