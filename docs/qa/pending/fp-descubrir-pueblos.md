---
verifier: agent
accounts: joiner
platform: android
data: seed
source: full-pass-2026-11-18
---
# Buscar un pueblo sin organizar ofrece ser su Embajador

**Preparación:** Sesión como joiner. Necesita municipios sembrados sin comunidad.

**Pasos:**
1. Descubrir / pueblos → busca un municipio.
2. Abre uno no activado.

**Esperado:** La búsqueda encuentra por nombre con y sin tildes; el no activado ofrece la solicitud de Embajador (no la envíes salvo que el flujo lo pida).

**Roto se ve así:** La búsqueda falla con tildes, o un pueblo sin activar se abre vacío sin explicar nada.
