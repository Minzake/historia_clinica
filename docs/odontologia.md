# Odontología integrada

Disponible en `develop` con la migración `202610230006_odontology.sql`. Reutiliza la identidad del paciente y guarda una ficha clínica independiente de podología.

## Habilitar y usar

1. Un administrador entra en **Usuarios → Acceso clínico → Odontología** y configura lectura, escritura, exportación y alcance para cada cuenta. Habilitar acceso o atención activa la especialidad en ese consultorio; la migración no otorga permisos automáticamente.
2. Si el profesional atiende, habilitar su perfil de odontología y completar nombre público y matrícula. Los perfiles de atención de las dos especialidades son independientes.
3. Desde **Pacientes**, abrir o crear la ficha odontológica del paciente existente. **Nueva historia** también permite elegir especialidad cuando hay más de una disponible.
4. Completar antecedentes, seleccionar una pieza y pintar directamente sobre el gráfico. Para los registros de pieza completa, elegir una opción en **Más símbolos y tratamientos** y tocar cualquier cara del diente ampliado. Hay dentición permanente, temporal y mixta: 32 piezas permanentes y 20 temporales. Cambiar la vista no borra registros.
5. Guardar la historia. Cada control conserva fecha, autor y leyenda; queda en modo lectura. Para otra evaluación, agregar un nuevo control. El borrador permite borrar por cara y deshacer.
6. Registrar indicaciones en el plan y su estado pendiente, en curso o realizado; agregar evoluciones fechadas. **Versiones y PDF** permite exportar la historia actual o un snapshot anterior con autorización vigente.

Las prestaciones también permiten elegir especialidad. Las agendas y horarios se configuran expresamente, sin abrir reservas por instalar el módulo.

## Datos y permisos

Los colores acompañan al nombre y símbolo de cada condición. La leyenda 1 diferencia hallazgos, tratamientos existentes e indicaciones; una pieza sin marca está sin evaluar. Las caras mesial, distal, vestibular, palatina/lingual y oclusal/incisal conservan la orientación del paciente. Los símbolos y la leyenda deben ser revisados por el profesional antes de su uso clínico.

El servidor valida piezas, caras, solapamientos, fechas, longitudes, estados, identidad y versiones concurrentes. Los controles guardados no se pueden alterar ni quitar desde el escritor; los controles nuevos reciben autor y fecha de registro del servidor. El plan y las evoluciones conservan su historial mediante snapshots de la ficha.

Recepción conserva acceso administrativo y a turnos, sin contenido clínico. La asignación de una ficha no amplía las capacidades generales de especialidad. Leer, editar y exportar son permisos separados. Ni el rol administrador ni el acceso previo a podología conceden acceso odontológico automáticamente.

El PDF incluye antecedentes, dibujos vectoriales con los colores por cara, controles y autores, plan y evoluciones. La leyenda contiene únicamente los símbolos usados en los controles exportados, sin repetirlos ni agregar estados del catálogo que no se registraron; si no hay marcas, se omite. Antes de exportar la versión actual se vuelve a consultar autorización y versión. La firma y el sello se completan en papel; no se incorpora firma electrónica.

## Entornos y comprobaciones

La migración 006 está aplicada en la base local de esta máquina. `npm run local -- --no-demo-user` aplica pendientes y abre http://localhost:5173 conservando cuentas y datos existentes. Subir código a Git no aplica la migración en Supabase remoto: cada entorno de destino requiere ejecutar los SQL pendientes con su configuración explícita.

Las pruebas cubren validación, pintura, aislamiento entre especialidades y consultorios, permisos, concurrencia, inmutabilidad y exportación. Los recorridos de navegador comprueban guardado/reapertura, niños y adultos, teclado, móvil, versiones y PDF. La maqueta de `prototipo-odontograma.html` se conserva como referencia histórica; sus datos no se importan al sistema.
