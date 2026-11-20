---
verifier: agent
accounts: none
platform: any
data: seed
source: fix/read-site-shared-list-rules
---
# La web del pueblo sigue mostrando arriba los eventos de hoy, y cuenta «1 integrante» en singular

**Preparación:** Un pueblo con un evento de un solo día que **ya empezó hoy** (hora de Madrid) y otro de mañana o después, ambos públicos; y un grupo aprobado con **1 integrante** y otro con varios. Sin sesión: la web es para quien llega por un enlace.

**Pasos:**
1. En el navegador del dispositivo, abre la página web del pueblo (`/<pueblo>`) después de la hora de inicio del evento de hoy.
2. Mira la fila de eventos.
3. En la misma página, mira las tarjetas de los grupos; abre el grupo de 1 integrante y luego el de varios.

**Esperado:** Paso 2: el evento de hoy aparece el primero, antes del de mañana, hasta que acabe el día en Madrid. Paso 3: la tarjeta y la página del grupo de uno dicen «1 integrante»; el de varios, «N integrantes». Un barrio con un vecino sigue diciendo «1 vecino».

**Roto se ve así:** el evento de hoy cae detrás de todos los futuros (al final de la fila, entre los pasados) en cuanto pasa su hora de inicio; o «1 integrantes».
