# Logo e ícono del consultorio

El titular puede personalizar la página desde **Consultorio → Identidad visual**. Se elige un logo para el encabezado y un favicon para la pestaña del navegador. Cada imagen tiene una vista previa y la opción **Usar predeterminado**. **Guardar datos** confirma los datos del profesional y las imágenes en una sola transacción.

Se aceptan PNG, JPG y WebP de hasta 5 MB y 4096 × 4096 píxeles. El navegador los convierte a PNG, conserva sus proporciones y elimina los metadatos del archivo original. El logo se ajusta a un máximo de 512 píxeles por lado; el favicon se centra en un lienzo transparente de 64 × 64. SVG e imágenes remotas no se admiten.

La identidad guardada se aplica al encabezado, al título y al favicon. Las páginas públicas usan el consultorio de la agenda seleccionada. El acceso general usa la identidad del único consultorio si solo hay uno; si hay varios, conserva la identidad predeterminada hasta conocer el centro. Al cambiar de consultorio se carga su identidad visual. Los formularios muestran los cambios como vista previa hasta guardarlos.

## Instalación y permisos

Requiere `202610230007_branding.sql`, que crea `clinic_branding`, habilita RLS y retira el acceso directo de las cuentas de la aplicación. Las imágenes se guardan separadas de las fichas y de las versiones clínicas. La lectura pública mediante `get_clinic_branding` devuelve únicamente el nombre del centro, su identificador y las dos imágenes; no expone contactos, pacientes, equipo ni datos clínicos.

`save_clinic_profile` exige un titular activo del consultorio, valida los encabezados PNG, dimensiones, tamaño y cierre del archivo y respeta la versión de configuración para evitar sobreescrituras. Recepción, profesionales y titulares de otro centro no pueden cambiar la identidad. La auditoría guarda quién realizó el cambio y si hay imágenes personalizadas, sin duplicar sus contenidos.

La identidad visual de la página no modifica los PDF ni las plantillas de correo. Las instalaciones anteriores conservan sus imágenes predeterminadas hasta que el titular guarde otras.
