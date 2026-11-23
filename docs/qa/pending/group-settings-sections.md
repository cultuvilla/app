---
verifier: agent
accounts: admin
platform: any
data: seed
source: feat/group-settings-sections
---
# Ajustes del grupo: sin textos grises y «Qué pueden hacer los socios»

**Preparación:** Entra como administrador de una peña con socios y de un grupo sin libro de socios (o un ayuntamiento) del seed.

**Pasos:**
1. En la peña, abre Ajustes del grupo y recorre la pantalla de arriba abajo.
2. Con la Charla abierta a todos, mira «Escribir en la Charla» y apágalo.
3. Entra como socio de esa peña y abre la Charla.
4. Como administrador, vuelve a encenderlo.
5. Abre Ajustes en el grupo sin libro de socios.

**Esperado:** Paso 1: ningún interruptor lleva una línea gris debajo (tampoco «Unirse requiere aprobación»). Bajo «Qué ven todos los socios» se leen «Lista de socios visible», «Quién está al día con la cuota», «Todos los avisos y votaciones» e «Ingresos y gastos del año». Donde antes estaba «Charla» hay una sección «Qué pueden hacer los socios» con un solo interruptor, «Escribir en la Charla». Paso 2: estaba encendido; al apagarlo se guarda. Paso 3: el socio no puede escribir (aviso de que solo escribe la junta). Paso 4: el socio vuelve a poder escribir. Paso 5: la sección se llama «Qué pueden hacer los integrantes», nunca «miembros».

**Roto se ve así:** el interruptor sale apagado con la Charla abierta (invertido); apagarlo deja escribir al socio; queda alguna línea gris; o aparece una clave sin traducir (`groups.settings.chatMembersWrite`, `groups.transparency.settings.cuota`).
