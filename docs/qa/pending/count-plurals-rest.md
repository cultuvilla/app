---
verifier: agent
accounts: admin
platform: any
data: seed
source: fix/count-plurals-rest
---
# El resumen de la cuota va en singular con un solo pago

**Preparación:** Como admin de un grupo con cuota configurada y **un solo socio** (o un periodo en el que solo haya pagado uno). La semilla e2e siempre trae al menos dos socios en la asociación: crea un grupo nuevo o un periodo nuevo.

**Pasos:**
1. En Cuota (admin), apunta el pago de un solo socio y mira el resumen.

**Esperado:** «de 1 pagada».

**Roto se ve así:** «de 1 pagadas», o texto con llaves como «{count, plural…».

**Pasada 2026-11-21 (Android, agente):** ✅ «1 voto», «0 de 1 plaza», «0 de 1 hecha», «(1 persona)». El paso de «Ya hay 1 apuntado» se quitó: bajar a 0 plazas lo para antes la validación 1–100 (`TaskSheet.tsx`). Queda solo este.
