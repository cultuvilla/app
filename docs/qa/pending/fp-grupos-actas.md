---
verifier: agent
accounts: admin+user
platform: android
data: seed
source: full-pass-2026-11-18
---
# Un acta se crea, la ven los asistentes y se puede editar y borrar

**Preparación:** Admin de un grupo con user como integrante. Las actas no tienen flujo Maestro.

**Pasos:**
1. Admin: grupo → actas → nueva: título, lugar, orden del día, asistentes (user incluido), acuerdos → guardar.
2. User: Mis actas / el grupo → abre el acta.
3. Admin: edita un acuerdo; luego borra el acta.

**Esperado:** Cada paso se ve en pantalla y en Firestore (busca el acta por título con `fs.mjs`); el user la lee sin controles de edición; tras borrar, desaparece para ambos.

**Roto se ve así:** El user no la ve, ve controles de edición, o el acta borrada sigue en su lista.
