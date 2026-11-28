---
verifier: agent
accounts: admin
platform: any
data: seed
source: test/i18n-count-plural-guard
---
# La palabra del día, los filtros de tareas y el resumen de fiestas van en singular cuando hay uno

**Preparación:** Como admin de un pueblo con **una sola** palabra en el diccionario, y de un grupo con tareas. En el lector web, un resumen de fiestas publicado (dev) cuyo pueblo tenga un evento o una persona apuntada, si lo hay.

**Pasos:**
1. Abre el pueblo y mira la tarjeta «Palabra del día».
2. En el tablero de tareas del grupo, activa un solo filtro y lee la etiqueta de accesibilidad del botón de filtros (TalkBack, o el árbol de accesibilidad).
3. Activa dos filtros y vuelve a leerla.
4. Abre el resumen de fiestas en el navegador (`/<pueblo>/fiestas/<año>`), si existe.

**Esperado:** Paso 1: el enlace dice «Ver la palabra». Paso 2: «Filtros (1 activo)». Paso 3: «Filtros (2 activos)». Paso 4: las cifras bajo el título van en número: «1 evento», «N eventos», «1 persona apuntada».

**Roto se ve así:** «Ver las 1», «Filtros (1 activos)», «1 eventos» o «1 personas apuntadas»; o texto con llaves como «{count, plural…».
