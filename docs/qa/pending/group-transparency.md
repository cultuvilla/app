---
verifier: agent
accounts: admin+user
platform: any
data: seed
source: feat/group-transparency
---
# La junta hace pública la cuota, los avisos o las cuentas, y un socio ve solo eso

**Preparación:** semilla `e2e`. En «Asociación Cultural E2E» (`e2e-org-asociacion`) `users.admin` es la junta y `e2e-user` un socio. Como admin: configura la cuota si no lo está, apunta un pago de otro socio (no de e2e-user), anota en Registros → Cuentas un gasto («Orquesta», 120 €), y envía un aviso con votación (Sí/No) solo a «La junta» y otro a «Todos». Vota «Sí» en el de la junta.

**Pasos:**
1. Como e2e-user abre el grupo: no hay sección «Cuentas»; en «Mi cuota» solo tu recibo; en «Avisos» solo el aviso a «Todos», sin resultados.
2. Como admin, Gestionar → Ajustes: bajo «Qué ven todos los socios» hay «Cuota pública», «Avisos públicos» y «Cuentas públicas», apagados y cada uno con su explicación. Enciende los tres.
3. Como e2e-user vuelve a abrir «Mi cuota», «Avisos» y la nueva «Cuentas».
4. Como admin apaga «Cuentas públicas»; como e2e-user vuelve al grupo.

**Esperado:** Tras el paso 3: en «Mi cuota», debajo de tu recibo, la lista de socios de este periodo con nombre y «Al día» / «Pendiente», sin un solo importe, fecha ni forma de pago. En «Avisos», además del tuyo, «Todos los avisos de la junta» con el de la junta, a quién iba («A la junta») y «Resultados: Sí 1 voto, No 0»; ningún «leído». En «Cuentas», el año con Cuotas (total por periodo), «Orquesta −120 €», el saldo, y ningún botón de añadir ni anular. En ningún sitio aparece un teléfono ni un email. `organizations/e2e-org-asociacion.transparency` pasa a `{cuota: true, avisos: true, cuentas: true}`. Tras el paso 4 la sección «Cuentas» desaparece.

**Roto se ve así:** un importe o una fecha de pago junto al nombre de otro socio; quién leyó o votó un aviso; un botón «Añadir» en las Cuentas del socio; «No se ha podido cargar» con los interruptores encendidos; o la sección «Cuentas» sigue tras apagarla.
