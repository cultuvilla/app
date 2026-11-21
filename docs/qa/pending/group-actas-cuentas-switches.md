---
verifier: agent
accounts: admin+user
platform: any
data: seed
source: feat/group-actas-cuentas-switches
---
# Un grupo con socios puede apagar sus Actas y sus Cuentas

**Preparación:** Entra como admin de la asociación de la semilla (`e2e-org-asociacion`), que tiene al menos un acta.

**Pasos:**
1. En el inicio del grupo, abre Ajustes.
2. Apaga «Actas» y vuelve al inicio del grupo.
3. Vuelve a Ajustes, apaga «Cuentas» y vuelve al inicio.
4. Entra como el socio (`e2e-user`) y mira el inicio del grupo.
5. Como admin, enciende las dos otra vez.

**Esperado:** En el paso 1, bajo «Qué usa el grupo», hay interruptores «Actas» y «Cuentas», encendidos. Tras el paso 2 ya no hay botón Actas en el inicio. Tras el paso 3 desaparece el botón Cuentas, y en Ajustes ya no sale el interruptor «Cuentas» de lo que ven los socios. En el paso 4 el socio tampoco ve Actas ni Cuentas. Tras el paso 5 vuelven los botones y las actas siguen ahí, sin perder nada.

**Roto se ve así:** El interruptor no se queda guardado; el botón sigue tras apagarlo; o al volver a encender faltan actas o apuntes.
