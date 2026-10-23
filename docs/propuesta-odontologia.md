# Propuesta: ficha odontológica por paciente

Estado: propuesta funcional y técnica, con maqueta navegable. No instala todavía una segunda especialidad ni cambia fichas, permisos o bases del sistema. Fecha: 23/10/2026. Rama de trabajo: develop.

## Alcance acordado

El usuario confirmó atención de **adultos y niños**. Incluir dentición permanente, temporal y vista mixta. Reutilizar la identidad administrativa del paciente; odontología y podología tienen fichas y permisos clínicos independientes.

La referencia aportada es [GouJana: símbolos e historial de odontogramas](https://goujana.co/clase_simbolos_odontograma). Se revisaron su explicación y captura pública. Se toma el comportamiento como referencia: mapa por piezas, leyenda, observaciones e historial fechado. La maqueta usa gráficos propios; no incorpora imágenes, código ni datos de pacientes de ese servicio.

La página enumera estados dentales y tratamientos existentes o indicados. Eso exige distinguir observación clínica, indicación pendiente y procedimiento efectivamente realizado, conservando el significado y texto de cada registro. El color solo no identifica el estado.

## Probar la maqueta

Abrir [prototipo-odontograma.html](prototipo-odontograma.html) en un navegador. Es un documento autónomo, sin dependencias ni llamadas de red para funcionar.

1. Seleccionar una pieza del mapa. La numeración se muestra desde la perspectiva del paciente y se abre una vista ampliada de sus cinco caras.
2. Elegir un pincel con su leyenda: rojo/caries, azul/resina o negro/amalgama en esta propuesta. Tocar cada cara para pintarla. Una misma pieza puede tener distintos colores en caras diferentes.
3. Para los demás registros, elegir el hallazgo/tratamiento y una o varias caras, o la pieza completa, y Aplicar. Cada marca aparece en el dibujo y en una lista accesible. La leyenda definitiva se acuerda con el profesional.
4. Cargar fecha y observaciones. Guardar una **versión de prueba**.
5. Abrir Historial para consultar versiones anteriores en modo lectura, sin reemplazar el borrador.
6. Cambiar entre vista permanente, temporal y mixta. No se borran las marcas de las piezas que dejan de verse.
7. La pestaña Ficha completa explica las otras secciones propuestas.

Los datos y versiones de la maqueta están solo en memoria de esa vista y se pierden al cerrarla. No es un guardado clínico ni una cuenta de paciente real. No contiene datos ni credenciales del sistema y no envía emails.

El borrador admite **borrado por cara** y **deshacer la última marca**. Repintar una cara reemplaza solo su marca de superficie actual y mantiene las demás caras y piezas. Si una marca abarca varias caras, modificar una separa ese registro para conservar las restantes. Los registros del mismo tipo y detalle se agrupan, y las versiones ya guardadas no se reescriben. Los símbolos de pieza completa se quitan desde su registro, no con el borrador de una cara.

La pintura también se puede operar con teclado: enfocar una cara del diente ampliado y activar con Enter o espacio. La selección de caras y el botón Aplicar siguen disponibles como alternativa.

## Funciones de la ficha integrada

- **Identificación:** paciente, consultorio y número de historia compartidos con el directorio. Datos personales y de contacto administrados una sola vez.
- **Anamnesis odontológica:** motivo de consulta, antecedentes, alergias, medicación y evaluación odontológica. Cuestionario y campos a acordar con el profesional que atienda.
- **Odontogramas:** controles por fecha, piezas/características, caras, especificaciones y observaciones. Vistas permanente, temporal y mixta.
- **Plan de tratamiento:** indicaciones por pieza/caras, descripción del procedimiento, estado pendiente/en curso/realizado y fechas. Registrar una indicación no la marca como realizada.
- **Evoluciones:** evaluación y procedimientos de cada consulta. Conservar el autor del registro y su fecha de guardado en el servidor.
- **Historial y PDF:** consultar controles previos y exportar las fichas autorizadas, con identificación y contexto profesional del documento. Descargar una copia no equivale a una firma del profesional.

La simbología visual definitiva, las combinaciones permitidas y el cuestionario se validan con el odontólogo antes de habilitar su uso con pacientes. La maqueta no afirma cumplir una nomenclatura obligatoria de una jurisdicción ni reemplaza el criterio del profesional.

## Representación del odontograma

La propuesta usa numeración FDI de dos dígitos como en la referencia:

- Permanentes: cuadrantes 1 a 4, ocho posiciones por cuadrante (32 piezas).
- Temporales: cuadrantes 5 a 8, cinco posiciones por cuadrante (20 piezas).
- Vista mixta: las dos series. Mostrar una pieza no afirma que esté presente, erupcionada ni evaluada.
- Una pieza sin registros se muestra como **sin evaluar**, nunca como sana por defecto.
- Mesial/distal se orientan hacia/lejos de la línea media según el cuadrante. Las caras internas se denominan palatina arriba y lingual abajo; la cara central, incisal u oclusal según la posición.
- El registro conserva código, nombre, categoría, pieza y caras. La representación no depende únicamente del color.
- Cada cara guarda su marca de superficie por separado. Por ejemplo, una pieza puede conservar rojo en oclusal, azul en mesial y negro en distal, y reproducir esos colores en el mapa y en las versiones históricas.

Catálogo inicial de referencia: sano, caries, resina, amalgama, corona adaptada/desadaptada, prótesis existente/indicada, sellante existente/indicado, endodoncia, necrosis pulpar, extracción indicada, recesión gingival y clínicamente ausente. Los códigos y dibujos de la maqueta son una propuesta de interfaz; no son diagnósticos automáticos.

## Datos y trazabilidad

Una identidad puede tener una ficha de cada especialidad en el mismo consultorio. No se crea un segundo paciente por abrir odontología y no se enlaza una cuenta del portal por coincidencia de DNI o email.

Esquema conceptual del módulo odontología v1:

```text
ClinicalEnvelope<OdontologyData>
  specialtyId: odontologia
  schemaVersion: 1
  identity: PatientIdentity compartida

  data.initial:
    fechaApertura
    motivoConsulta
    anamnesis definida con el profesional

  data.clinical:
    odontogramas[]:
      id, fechaControl, versionLeyenda
      registros[]:
        id, piezaFDI, caras[], codigoCatalogo
        categoria: hallazgo | tratamientoExistente | indicacion
        detalle
      especificaciones, observaciones
    planTratamiento[]:
      id, piezaFDI?, caras[], procedimiento
      estado: pendiente | enCurso | realizado
      fechaIndicacion, fechaRealizacion?

  data.evolutions[]:
    id, fecha, procedimiento/evaluacion
```

Los identificadores reales de paciente, ficha y consultorio, autor y fechas del servidor se verifican/derivan en el backend. No confiar en un autor o permiso enviado por el formulario.

La ficha integrada debe conservar la versión de la leyenda con cada control para reproducir sus colores y significados originales, aunque se revise el catálogo más adelante.

Cada guardado clínico conserva su versión completa; los controles guardados se consultan sin reescribir sus copias históricas. Las correcciones se reflejan en una versión nueva. Controlar por separado la versión de identidad administrativa y la versión de ficha, como en la base actual.

## Integración necesaria en el sistema actual

1. **Catálogo y habilitación:** migración nueva, posterior a 001–005, para registrar odontología y su esquema. Habilitarla por consultorio mediante una operación de administrador. No conceder acceso odontológico automáticamente al equipo de podología.
2. **Registro de módulos:** incorporar modelo, validación, editor y PDF de odontología. Mantener rechazo de especialidades/esquemas desconocidos. La fachada de compatibilidad de podología continúa funcionando.
3. **Persistencia:** extender el escritor autorizado `save_clinical_chart`, hoy restringido a podología, con validación odontológica en SQL. Reutilizar identidad, ficha, encuentros, versiones y asignaciones. No guardar salud dental en `patients.details`, accesible al directorio administrativo.
4. **Lecturas y rutas:** dirigir explícitamente por especialidad. El editor compartido y varios métodos clínicos/PDF hoy usan podología. Listado, Inicio, búsquedas, enlaces de ficha, historial y exportación deben transportar la especialidad para no abrir una ficha de otra disciplina.
5. **Usuarios y permisos:** permitir elegir especialidad en el acceso clínico y en el perfil profesional. Aplicar lectura, escritura, exportación y alcance asignado/todas. Las concesiones de ficha siguen limitadas por esos máximos. Recepción no accede a contenido clínico.
6. **Servicios y agendas:** permitir crear prestaciones odontológicas y asignarlas solo a profesionales habilitados. La disponibilidad sigue teniendo duración, reglas y enlace por agenda; se conserva la protección global de horarios del profesional.
7. **Documentación y pruebas:** actualizar el diagrama del sistema cuando odontología esté efectivamente instalada. Probar la migración y el módulo en el entorno local antes de aplicarlos a un destino remoto.

La habilitación de una especialidad y los permisos son decisiones distintas. La implementación debe revisar también que cambiar el perfil de una especialidad no desactive por accidente la atención del mismo profesional en otra.

No modificar migraciones ya aplicadas. No ejecutar migraciones remotas ni reasignar cuentas o fichas para probar esta propuesta.

## Validaciones a implementar en cliente y servidor

- Piezas dentro del conjunto FDI permitido; no aceptar números arbitrarios.
- Caras dentro del catálogo, sin duplicados y sin combinar pieza completa con caras individuales en un mismo registro.
- Código de hallazgo/tratamiento conocido, con objetivo de pieza o superficie consistente.
- Una marca de pieza sana no se combina con registros incompatibles en la misma evaluación; las reglas clínicas adicionales se definen con el profesional.
- Fechas válidas; controles realizados no futuros ni anteriores al nacimiento informado.
- Texto limitado y normalizado, identificadores únicos por registro y límites al tamaño de la ficha.
- Sin duplicados idénticos de pieza/caras/código en el mismo control.
- Estados de plan y fechas coherentes; una indicación no se convierte en tratamiento realizado por pintar la pieza.
- Acceso por membresía activa, consultorio, especialidad y ficha; comprobación independiente de exportación.
- Concurrencia: una versión desactualizada no sobrescribe la ficha ni la identidad.
- Mantener copias históricas y autoría; no eliminar controles guardados por limpiar el dibujo actual.

## Verificación de la propuesta

La maqueta permite comprobar: selección de piezas/caras, colores simultáneos por cara, repintado parcial, borrado y deshacer, manejo de registros que abarcan varias caras, teclado, catálogo, prevención de duplicados, pieza sana incompatible con caries, historial independiente y de solo lectura, observaciones históricas y cambio de dentición sin pérdida de marcas. También se verifica el ancho en escritorio/celular.

Para el módulo integrado faltan sus pruebas de modelo, SQL y navegador: separar permisos de podología/odontología, impedir lecturas de recepción, reutilizar una identidad en ambas fichas, aislamiento entre consultorios, concurrencia, autorización de versiones/PDF y persistencia real del odontograma.

Esta propuesta no instala el módulo ni acredita su funcionamiento clínico: deja definidos el alcance y una interfaz que se puede revisar antes de esa implementación.
