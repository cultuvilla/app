---
verifier: agent
accounts: any
platform: any
data: seed
source: "feat/bounded-text-scaling"
---
# Con la letra del sistema al máximo, el texto crece hasta 1,5× y nada se corta

**Preparación:** En el dispositivo, sube el tamaño de letra del sistema al máximo (Android: Ajustes → Pantalla → Tamaño de fuente al máximo; iOS: Accesibilidad → Pantalla y tamaño del texto → Texto más grande, con los tamaños de accesibilidad activados, al máximo).

**Pasos:**
1. Abre la app en un pueblo sembrado y recorre el inicio: tarjetas de eventos y noticias en las filas horizontales.
2. Abre un evento con botones de acción (Unirme, Compartir…) y un lugar con el botón flotante «＋».
3. Abre un formulario con campos de texto (por ejemplo, crear noticia) y escribe en uno.
4. Vuelve a dejar el tamaño de letra normal y compara.

**Esperado:** Con la letra al máximo el texto se ve claramente más grande que con la letra normal, pero como mucho una vez y media; las tarjetas, los botones de acción y el botón flotante conservan su forma y el texto no queda cortado ni fuera de pantalla. Las iniciales de los avatares no cambian de tamaño.

**Roto se ve así:** El texto crece mucho más (el doble o más) y desborda las tarjetas, los botones se parten en varias líneas cortadas o el botón flotante sale de la pantalla; o, al contrario, el texto no crece nada con la letra al máximo.
