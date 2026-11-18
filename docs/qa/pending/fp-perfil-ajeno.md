---
verifier: agent
accounts: user
platform: android
data: seed
source: full-pass-2026-11-18
---
# El perfil de otro vecino enseña lo público y deja bloquearle

**Preparación:** Sesión como user. Abre el perfil del admin desde un comentario o la lista de miembros.

**Pasos:**
1. Mira su perfil.
2. Bloquéale; ve a Ajustes → bloqueados y desbloquéale.

**Esperado:** Solo datos públicos (sin teléfono, sin personas privadas); bloquear y desbloquear se reflejan en la lista.

**Roto se ve así:** Se ven datos privados, o el bloqueo no aparece en Ajustes.
