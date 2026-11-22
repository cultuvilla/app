---
verifier: agent
accounts: admin
platform: any
data: seed
source: develop
---
# Cobros: el estado en palabras y el botón «Cobrar»

**Preparación:** Entra como admin de la asociación de la semilla (`e2e-org-asociacion`) con la cuota configurada y la fecha de vencimiento ya pasada. Ten un socio sin pagar, otro con la cuota pagada y otro con un pago a medias (anota, por ejemplo, 10 € de una cuota de 30 €). Abre Cobros.

**Pasos:**
1. Mira la fila del socio sin pagar, en «Por pagar».
2. Mira la fila del pago a medias.
3. Toca «Cobrar» en el socio sin pagar.
4. Ve a «Pagadas» y mira la fila del que pagó.

**Esperado:** En el paso 1 la fila dice «Venció el …» en rojo y negrita, seguido de «· Debe 30,00 €» en gris, y a la derecha un botón naranja relleno «Cobrar». En el paso 2 dice «Ha pagado 10,00 € · Debe 20,00 €» y el botón, solo con borde, dice «Cobrar 20,00 €». El paso 3 abre la hoja que pregunta cómo ha pagado. En el paso 4 la fila dice «✓ Pagada · 30,00 €» en verde y no tiene botón.

**Roto se ve así:** Sigue saliendo «✓ Pagó» junto a «Vencida»; el pago a medias tiene solo un «+»; una fila pagada tiene botón.
