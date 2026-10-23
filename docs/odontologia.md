# Odontología integrada

Disponible en `develop` con la migración `202610230006_odontology.sql`. Reutiliza la identidad del paciente y guarda una ficha clínica independiente de podología.

## Habilitar y usar

1. Un administrador entra en **Usuarios → Acceso clínico → Odontología** y configura lectura, escritura, exportación y alcance para cada cuenta. Habilitar acceso o atención activa la especialidad en ese consultorio; la migración no otorga permisos automáticamente.
2. Si el profesional atiende, habilitar su perfil de odontología y completar nombre público y matrícula. Los perfiles de atención de las dos especialidades son independientes.
3. Desde **Pacientes**, abrir o crear la ficha odontológica del paciente existente. **Nueva historia** también permite elegir especialidad cuando hay más de una disponible.
4. Completar antecedentes, seleccionar una pieza y pintar directamente sobre el gráfico. Para los registros de pieza completa, elegir una opción en **Más símbolos y tratamientos** y tocar cualquier cara del diente ampliado. Hay dentición permanente, temporal y mixta: 32 piezas permanentes y 20 temporales. Cambiar la vista no borra registros.
5. Guardar la historia. Al volver a abrirla, **Odontograma actual** continúa el último estado con sus marcas y observaciones. Actualizar únicamente lo que cambió, usando los pinceles, el borrador por cara o deshacer. Cada guardado con modificaciones conserva una nueva copia fechada y el autor; no hace falta cargar nuevamente el gráfico.
6. Registrar indicaciones en el plan y su estado pendiente, en curso o realizado; agregar evoluciones fechadas. **Versiones y PDF** permite exportar la historia actual o un snapshot anterior con autorización vigente.

El PDF respeta la dentición permanente, temporal o mixta de cada control, junto con sus marcas y leyenda correspondientes. En la descarga actual, cambiar **Dentición visible** también cambia la vista de impresión de ese control, sin modificar el registro guardado. Las versiones anteriores conservan su propia selección de dentición. Las marcas ocultas permanecen guardadas y se pueden consultar o imprimir volviendo a la vista mixta.

**Odontograma e historial** permite consultar los guardados anteriores en modo lectura y volver al estado actual para continuar. Descartar cambios recupera el último estado guardado. Abrir la ficha, cambiar la vista de impresión o guardar antecedentes, tratamientos y evoluciones sin modificar el gráfico no agrega un odontograma duplicado. La fecha de actualización se propone con el día actual y puede corregirse antes de guardar.

Las prestaciones también permiten elegir especialidad. Las agendas y horarios se configuran expresamente, sin abrir reservas por instalar el módulo.

## Datos y permisos

Los colores acompañan al nombre y símbolo de cada condición. La leyenda 1 diferencia hallazgos, tratamientos existentes e indicaciones; una pieza sin marca está sin evaluar. Las caras mesial, distal, vestibular, palatina/lingual y oclusal/incisal conservan la orientación del paciente. Los símbolos y la leyenda deben ser revisados por el profesional antes de su uso clínico.

El servidor valida piezas, caras, solapamientos, fechas, longitudes, estados, identidad y versiones concurrentes. Los controles guardados no se pueden alterar ni quitar desde el escritor; los controles nuevos reciben autor y fecha de registro del servidor. El plan y las evoluciones conservan su historial mediante snapshots de la ficha.

Recepción conserva acceso administrativo y a turnos, sin contenido clínico. La asignación de una ficha no amplía las capacidades generales de especialidad. Leer, editar y exportar son permisos separados. Ni el rol administrador ni el acceso previo a podología conceden acceso odontológico automáticamente.

El PDF incluye antecedentes, dibujos vectoriales con los colores por cara, controles y autores, plan y evoluciones. Cada odontograma muestra su leyenda debajo del gráfico y antes del detalle de las marcas, con únicamente los símbolos usados en ese control, sin repetirlos; si no hay marcas, se omite. Antes de exportar la versión actual se vuelve a consultar autorización y versión. La firma y el sello se completan en papel; no se incorpora firma electrónica.

## Entornos y comprobaciones

La migración 006 está aplicada en la base local de esta máquina. `npm run local -- --no-demo-user` aplica pendientes y abre http://localhost:5173 conservando cuentas y datos existentes. Subir código a Git no aplica la migración en Supabase remoto: cada entorno de destino requiere ejecutar los SQL pendientes con su configuración explícita.

Las pruebas cubren validación, pintura, aislamiento entre especialidades y consultorios, permisos, concurrencia, inmutabilidad y exportación. Los recorridos de navegador comprueban guardado/reapertura, niños y adultos, teclado, móvil, versiones y PDF. La maqueta de `prototipo-odontograma.html` se conserva como referencia histórica; sus datos no se importan al sistema.
