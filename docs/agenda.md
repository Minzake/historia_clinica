# Agenda y asignación de turnos

La vista principal muestra las consultas en filas compactas, con hora, paciente, prestación y estado. Permite elegir día o semana y filtrar profesional cuando hay varios. **Nuevo turno** es la acción principal; **Agregar turno** dentro de un día ya carga esa fecha.

En la vista diaria, la tira semanal permite cambiar de día sin abrir el calendario. En celular, la vista semanal presenta los días uno debajo del otro, sin desplazar una tabla horizontal.

## Asignar un turno

1. Buscar al paciente por nombre o DNI. Los resultados aparecen al escribir. Al elegirlo, se muestra un resumen y se conservan sus datos de contacto. **Ver datos** permite corregirlos; **Cargar un paciente nuevo** habilita la carga manual.
2. Elegir el día con la tira semanal, **Hoy**, **Mañana** o el calendario. Los horarios se separan en **Mañana** y **Tarde**, para llegar a la franja deseada sin recorrer una lista larga. Si existe un único profesional elegible, queda completado. Las prestaciones se limitan a las que el profesional puede atender; se propone una compatible con el profesional seleccionado.
3. Revisar la hora de finalización y guardar. **Cambiar duración** permite otra duración en múltiplos de 15 minutos y **Ingresar otra hora** ofrece la carga manual. Los solapamientos se validan en la pantalla y en el servidor.

**Más opciones** del formulario reúne celular, email, observaciones internas y la vinculación explícita a una cuenta verificada del portal. Seleccionar un paciente del directorio solo completa sus datos: no vincula una cuenta ni crea una ficha clínica. Las observaciones privadas conservan sus permisos.

En PC, paciente y horario se distribuyen en dos columnas. En celular se muestran en una columna. El resumen con fecha, inicio, finalización y paciente acompaña al botón de guardar al pie del formulario.

## Reservar como paciente

La página pública muestra una ficha breve del consultorio y deja las condiciones dentro de un desplegable. El selector ofrece días de la semana, fechas rápidas y horarios agrupados por franja. Al elegir una hora, el resumen muestra fecha, profesional y duración antes de confirmar.

Si la persona necesita iniciar sesión, los enlaces conservan agenda, fecha y hora en la URL de retorno, sin información personal ni clínica. Solo se admiten destinos internos de reserva. Volver desde el registro al login también conserva ese destino. La disponibilidad se consulta nuevamente al regresar: si el horario dejó de estar libre se borra la selección, y nunca se crea una reserva automáticamente al ingresar. La verificación de una cuenta nueva por email mantiene el circuito existente de Supabase; la URL de retorno no reemplaza esa verificación.

## Opciones secundarias

El menú **Opciones** de la agenda permite bloquear un horario, abrir horarios y reservas web, actualizar la vista y mostrar turnos cancelados. Los cancelados se ocultan inicialmente, pero se conservan y pueden consultarse. La configuración de reservas y de correo se muestra en ese menú; no ocupa la vista principal con avisos permanentes.

Abrir un turno permite reprogramarlo, cancelar o registrar asistencia cuando corresponde. Abrir un bloqueo permite editarlo o cancelarlo. Cerrar un formulario con cambios pide confirmar antes de descartarlos.

Las fechas mantienen DD/MM/AAAA, los horarios pertenecen a la zona del consultorio y la base conserva sus controles de permisos, concurrencia y conflictos entre consultorios. Esta mejora no requiere una migración.
