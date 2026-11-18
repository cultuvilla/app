---
verifier: agent
accounts: user
platform: android
data: seed
source: full-pass-2026-11-18
---
# Un comentario largo con emojis se escribe y se lee sin romper la pantalla

**Preparación:** Sesión como user. Cualquier evento.

**Pasos:**
1. Escribe un comentario de ~600 caracteres con saltos de línea y emojis y envíalo.

**Esperado:** El teclado no tapa el campo mientras escribes; el comentario se ve entero y bien partido; está en Firestore igual que se escribió.

**Roto se ve así:** El campo queda bajo el teclado, el texto se corta o desborda, o se guarda distinto.
