---
verifier: agent
accounts: none+user
platform: android
data: seed
source: feat/sheets-drag-only
---
# Los paneles de abajo se cierran arrastrando la barra, sin ✕

**Preparación:** AVD tamaño Pixel, emuladores con el seed. La misma pasada en iOS la hace `ios-e2e` (flujos 00, 30, 41 y 92).

**Pasos:**
1. Sin sesión, abre un evento y pulsa «Apuntarme»: sale el panel de registro. Arrastra la barra gris de arriba hacia abajo.
2. Con sesión, en el pueblo pulsa «Añadir contenido». Arrastra la barra hacia abajo un poco (menos de un dedo) y suelta; luego arrástrala del todo.
3. Abre el menú (☰ arriba a la derecha) y arrastra su barra hacia abajo.
4. En un grupo con socios, abre la ficha de un socio y el filtro de noticias del pueblo; ciérralos con la barra.
5. Con TalkBack, en cualquier panel, la barra se anuncia como botón «Cerrar» y al activarla se cierra.

**Esperado:** ningún panel tiene ✕ ni botón «Cerrar». Un arrastre corto devuelve el panel a su sitio; uno largo (o rápido) lo cierra. Tocar la barra, tocar fuera o el botón atrás de Android también cierran. La lista de dentro de un panel sigue haciendo scroll sin cerrarlo.

**Roto se ve así:** una ✕ en la cabecera; la barra no se mueve con el dedo; el panel se cierra al hacer scroll en su lista; el panel se queda desplazado la próxima vez que se abre.
