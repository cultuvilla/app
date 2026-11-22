---
verifier: agent
accounts: admin
platform: any
data: seed
source: develop
---
# Ajustes del grupo: quién ve la Cosateca, junto a los recordatorios de la cuota

**Preparación:** Entra como admin de la asociación de la semilla (`e2e-org-asociacion`), con la cuota y la Cosateca activadas. Abre Ajustes.

**Pasos:**
1. Mira la sección «Qué usa el grupo».
2. Baja hasta el final.
3. Desactiva la Cosateca y vuelve a mirar el final.

**Esperado:** En el paso 1 solo hay interruptores (Cuota, Actas, Cuentas, Cosateca), sin «Solo integrantes / Todo el pueblo». En el paso 2 la última sección, «Cómo funcionan», tiene «Enviar recordatorios de la cuota» y, debajo, «Quién puede ver la Cosateca» con «Solo integrantes / Todo el pueblo». En el paso 3 esa segunda parte desaparece.

**Roto se ve así:** El selector sigue debajo del interruptor de la Cosateca, o la sección del final sigue llamándose «Cuota».
