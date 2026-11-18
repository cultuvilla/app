---
verifier: agent
accounts: none+user
platform: android
data: seed
source: fix/qa-text-overflow
---
# Ningún texto se corta: botón de unirse, interruptor de privacidad e iniciales

**Preparación:** AVD tamaño Pixel, escala de fuente por defecto, emuladores con el seed.

**Pasos:**
1. Sin sesión, abre un pueblo activo (`[pueblo]`) y mira la fila de acciones (`village-join-action` junto a «Compartir»).
2. Inicia sesión como user, ve a `[pueblo]/entidades` → «Añadir grupo» y mira el interruptor de privacidad (`org-members-public-toggle`) en ambas posiciones.
3. Abre `[pueblo]/miembros` (Personas) y mira los avatares sin foto con dos iniciales («AP», «LD»).

**Esperado:**
1. «Inicia sesión para unirte» se lee entero, en una línea (algo más pequeño) o en dos; nunca con «…».
2. «Los integrantes del grupo son visibles para el pueblo» se parte en líneas junto al interruptor, sin salirse por la derecha.
3. Las dos iniciales caben dentro del círculo, centradas.

**Roto se ve así:** «Inicia sesión para uni…»; «…visibles para el pu» cortado en el borde de la pantalla; letras que asoman fuera del círculo del avatar.
