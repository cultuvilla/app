---
verifier: agent
accounts: any
platform: any
data: seed
source: feat/village-seat-row
---
# El núcleo principal abre su sección como «El pueblo»

**Preparación:** Activa un pueblo nuevo por el flujo real (Embajador → aprobación), p. ej. Figueruela de Arriba: `startVillage` siembra sus localidades de OSM, cabecera incluida con `isSeat: true`. Los pueblos de los datasets de seed no traen la cabecera.

**Pasos:**
1. Abre la portada del pueblo y baja hasta Localidades (o Aldeas en Galicia).
2. Mira la primera tarjeta y compárala con las demás.
3. Con VoiceOver/TalkBack, enfoca esa tarjeta.

**Esperado:** Paso 2: la primera tarjeta es la cabecera (Figueruela de Arriba), aunque tenga menos vecinos que otra localidad; lleva borde de color y su subtítulo dice «El pueblo · N vecinos». Las demás solo dicen «N vecinos» y no tienen borde. Paso 3: se lee «Figueruela de Arriba, El pueblo · N vecinos».

**Roto se ve así:** la cabecera aparece en medio, ordenada por vecinos; no hay borde; o el subtítulo muestra una clave sin traducir (`village.admin.barrios.seat`).

**Pasada 2026-11-21 (Android, agente):** ✅ solo la pantalla, con localidades escritas a mano como las siembra el código (orden, borde, «El pueblo · 1 vecino», TalkBack). Sin probar: que `startVillage` siembre la cabecera con `isSeat: true` — el emulador no tiene datos de OSM.
