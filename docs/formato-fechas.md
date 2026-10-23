# Fechas del sistema

Las fechas visibles usan **DD/MM/AAAA**, con ceros iniciales. Cuando corresponde una hora, se muestra **DD/MM/AAAA HH:mm**, en formato de 24 horas.

- El componente compartido `Field` ofrece el mismo ingreso de fechas en pacientes, podología, odontología, agenda, reservas y bloqueos. Permite escribir, pegar o elegir desde el calendario. Los separadores se agregan al escribir números.
- Se validan fechas reales, años bisiestos, campos obligatorios, límites y horas válidas. Los mensajes de límites también usan DD/MM/AAAA.
- `formatDate` y `formatDateTime` centralizan la presentación. Las fechas de calendario no cambian de día por la zona horaria; los instantes se convierten según la zona indicada, como la del consultorio para los turnos.
- Los dos PDF clínicos y los avisos de turnos muestran el mismo formato. Los historiales y selectores de controles también lo usan.

El estado clínico, las llamadas API y la base conservan sus contratos ISO (`AAAA-MM-DD`, fechas/horas locales y marcas de tiempo según corresponda). No se modifica ni migra el contenido guardado para cambiar su presentación.

Las pruebas cubren el formato, la escritura y edición manual, el calendario, las fechas inválidas, las zonas horarias, las exportaciones y los recorridos de agenda y pacientes.
