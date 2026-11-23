---
verifier: agent
accounts: member
platform: any
data: seed
source: feat/offline-village-sync
---
# Un pueblo del que eres vecino se abre sin conexión aunque no lo hayas visitado

**Preparación:** Una cuenta vecina de dos pueblos con eventos, lugares y organizaciones (p. ej. en dev, un usuario de demo_1 unido a un segundo pueblo). Instala la app limpia e inicia sesión; el pueblo activo es el primero. No abras el segundo.

**Pasos:**
1. Con conexión, espera en Inicio ~10 s.
2. Activa el modo avión.
3. Cambia al segundo pueblo (Perfil → Mis pueblos) y recorre sus secciones.
4. Abre un evento y un lugar del segundo pueblo.
5. Desactiva el modo avión, manda la app a segundo plano un momento y vuelve.

**Esperado:** Paso 3: el segundo pueblo pinta al momento con sus eventos, artículos, carteles, barrios, lugares, agrupaciones, historia y palabra del día, con la franja «Sin conexión — mostrando datos guardados»; las primeras tarjetas tienen imagen. Paso 4: las fichas se abren con su contenido. Paso 5: la franja desaparece y nada se queda cargando.

**Roto se ve así:** el segundo pueblo se queda en esqueletos o en error sin conexión; las tarjetas sin imagen; o tras volver a primer plano alguna sección se queda cargando.
