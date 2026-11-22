---
verifier: agent
accounts: admin+user
platform: any
data: seed
source: develop
---
# El admin puede apagar la Charla del grupo

**Preparación:** Entra como admin de la asociación de la semilla (`e2e-org-asociacion`). Abre Ajustes.

**Pasos:**
1. En «Qué usa el grupo», desactiva «Charla».
2. Vuelve al inicio del grupo.
3. Entra como el socio (`e2e-user`) y abre el mismo grupo.
4. Vuelve como admin y activa «Charla» otra vez.

**Esperado:** En el paso 1 desaparece «Escribir en la Charla» de los ajustes. En los pasos 2 y 3 el grupo no tiene botón Charla, y un enlace a la Charla lleva al inicio del grupo. En el paso 4 la Charla vuelve con todos sus mensajes.

**Roto se ve así:** El interruptor no se guarda (vuelve solo a activado), o la Charla sigue apareciendo apagada, o reaparece sin sus mensajes.
