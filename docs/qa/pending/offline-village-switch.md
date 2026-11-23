---
verifier: agent
accounts: user
platform: android
data: seed
source: fix/offline-village-switch
---
# Sin conexión, cambiar de pueblo activo cambia al momento y se sincroniza al volver

**Preparación:** Con una cuenta que sea vecina de al menos dos pueblos, con la app abierta y ambos pueblos vistos una vez con conexión (para que estén en la caché). Quita la conexión: `adb shell cmd connectivity airplane-mode enable`.

**Pasos:**
1. Perfil → «Mis pueblos» (o la lista de pueblos de Mis pueblos) y toca el pueblo que no está activo.
2. Vuelve al Perfil y, en la tarjeta de pueblos, toca otro pueblo no activo.
3. Devuelve la conexión: `adb shell cmd connectivity airplane-mode disable`. Espera unos segundos.

**Esperado:** Pasos 1 y 2: la app abre Mi pueblo del pueblo tocado al instante, sin ruedecita que no acaba, y la cabecera muestra ese pueblo. Paso 3: `users/{uid}.activeMunicipalityId` en Firestore pasa a ser el último pueblo elegido; al reabrir la app sigue activo.

**Roto se ve así:** en Mis pueblos la fila se queda girando para siempre; desde el Perfil tocar el pueblo no hace nada; o, tras volver la conexión, Firestore conserva el pueblo anterior.
