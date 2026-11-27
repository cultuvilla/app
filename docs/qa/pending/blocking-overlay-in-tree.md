---
verifier: agent
accounts: admin
platform: any
data: seed
source: fix/blocking-overlay-in-tree
---
# La pantalla «Eliminando…» se ve igual y bloquea la pantalla, sin congelar la app

**Preparación:** Una cuenta que pueda borrar un lugar (o una noticia) de un pueblo sembrado.

**Pasos:**
1. Abre un lugar → Editar → pulsa la papelera del encabezado y confirma «Eliminar».
2. Mientras sale «Eliminando lugar…», toca varias veces el formulario y el botón de volver del encabezado; en Android pulsa también el botón atrás del sistema.
3. Repite con otro lugar en modo avión, para que el borrado tarde o falle.

**Esperado:** Tras confirmar aparece, con un fundido corto, el fondo oscurecido a pantalla completa con el indicador de carga y «Eliminando lugar…», tapando también el encabezado naranja y la barra de estado. Ningún toque ni el botón atrás hacen nada mientras está. Al terminar, la app vuelve atrás sin el lugar; si falla, la capa desaparece y la pantalla responde de nuevo.

**Roto se ve así:** La capa solo cubre el encabezado o deja parte de la pantalla sin oscurecer; un toque edita un campo o vuelve atrás durante el borrado; o la app deja de responder y hay que cerrarla.
