---
verifier: agent
accounts: none
platform: any
data: seed
source: fix/village-gate-way-out
---
# Un enlace a un pueblo que no existe siempre deja volver al inicio

**Preparación:** La app cerrada del todo (arranque en frío), sin sesión o con cualquiera.

**Pasos:**
1. Abre `cultuvilla://pueblo-que-no-existe` (en Android: `adb shell am start -a android.intent.action.VIEW -d cultuvilla://pueblo-que-no-existe`).
2. Pulsa la flecha atrás de la cabecera (no el botón atrás del sistema).
3. Repite desde la app abierta: inicio → abre el mismo enlace → flecha atrás.

**Esperado:** Se ve «No encontramos este pueblo…» bajo una cabecera con flecha atrás. En frío, la flecha lleva a la pestaña de inicio; con la app abierta, vuelve a la pantalla anterior.

**Roto se ve así:** El mensaje aparece sin cabecera ni flecha, y en iOS (o en Android sin usar el botón del sistema) no hay forma de salir.
