---
verifier: agent
accounts: admin
platform: any
data: seed
source: refactor/mobile-neutral-grey-tokens
---
# Los grises de iconos, bordes y fondos se ven igual que antes, salvo matices

**Preparación:** Sesión de admin de un pueblo con barrios y eventos con inscripción (seed `demo_1`).

**Pasos:**
1. Abre Ajustes y la lista de Mis pueblos: mira las flechas «›» de cada fila.
2. Crea un evento: abre el selector de pueblo, el de barrio y los campos de fecha (borde del campo, cabecera del calendario, campo deshabilitado).
3. En un evento con inscripción, apúntate a ti y deja a una persona en lista de espera: mira las dos píldoras flotantes.
4. En un grupo con aprobación, pide unirte: mira el botón «pendiente».
5. Al elegir ubicación, abre el mapa y busca una dirección: mira el campo de búsqueda, su botón, la lista de sugerencias y la etiqueta de la dirección.
6. Abre una foto a pantalla completa y un Wrapped.

**Esperado:** Flechas gris claro; bordes y separadores gris neutro como antes; píldoras verde (apuntado) y ámbar (lista de espera) y botón marrón grisáceo (pendiente), sin cambio de color; fondo negro detrás de fotos y Wrapped. Cambios ligeros admitidos: el buscador de direcciones pasa a gris pizarra (texto más oscuro, icono de búsqueda algo más claro), la etiqueta de la dirección en el mapa algo más oscura, y el borde de los pasos sin rellenar del indicador de pasos un tono más oscuro.

**Roto se ve así:** un icono, borde o fondo desaparece o sale negro o de otro color (un token mal leído), o una sombra ya no se ve.
