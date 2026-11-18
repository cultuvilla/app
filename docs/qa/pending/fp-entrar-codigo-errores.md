---
verifier: agent
accounts: none
platform: android
data: seed
source: full-pass-2026-11-18
---
# Entrar con código: un código mal escrito se rechaza y se puede pedir otro

**Preparación:** Sin sesión. El código llega a `authOtpCodes` (léelo con `fs.mjs list authOtpCodes`).

**Pasos:**
1. Entrar → email `e2e-user@cultuvilla.test` → Enviar código.
2. Teclea un código incorrecto.
3. Pide reenviar y teclea el bueno.

**Esperado:** Mensaje de error claro con el código malo, sin bloquear el campo; con el bueno entras en tu perfil.

**Roto se ve así:** El código malo deja un spinner, o el reenviar no hace nada, o entras con cualquier código.
