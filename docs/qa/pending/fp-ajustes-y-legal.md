---
verifier: agent
accounts: user
platform: android
data: seed
source: full-pass-2026-11-18
---
# Ajustes y las páginas legales se abren, se leen y se cierran

**Preparación:** Sesión como user.

**Pasos:**
1. Ajustes → cada entrada (notificaciones, cambiar email, bloqueados, términos, privacidad, eliminar cuenta sin confirmar).

**Esperado:** Cada pantalla carga, bloqueados vacío lo dice, los textos legales se pueden bajar hasta el final, atrás funciona.

**Roto se ve así:** Una página legal vacía o que no hace scroll, o una entrada que no abre nada.
