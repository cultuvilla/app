---
verifier: agent
accounts: user
platform: android
data: seed
source: feat/secondary-button-outline
---
# Los botones secundarios son un contorno terracota, no un relleno melocotón

**Preparación:** AVD tamaño Pixel, emuladores con el seed, sesión como admin de un grupo con socios.

**Pasos:**
1. Abre un grupo → Socios y mira «Añadir socio» (`socios-add`).
2. Abre cualquier campo de fecha (p. ej. crear evento → fecha) y mira «Cancelar» junto a «Aceptar».
3. En las tareas del grupo, mira «No puedo» / «Quitarme» en una fila de turno.

**Esperado:** los tres son un botón sin relleno, con borde fino terracota y texto terracota en negrita; el botón principal de al lado sigue siendo naranja relleno. El texto se lee entero, sin cortes.

**Roto se ve así:** fondo melocotón con texto verde oliva; o un botón sin borde visible; o texto cortado con «…» en los botones anchos («Compartir en WhatsApp»).
