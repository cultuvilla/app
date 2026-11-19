---
verifier: agent
accounts: admin
platform: any
data: seed
source: feat/ajustes-headings
---
# Los Ajustes del grupo van por apartados, y la aprobación para unirse está ahí

**Preparación:** Como admin de una asociación o peña con socios (p. ej. Museros en dev), con la cuota configurada.

**Pasos:**
1. Abre el grupo → Gestionar → Ajustes.
2. Desactiva «Unirse requiere aprobación»; en el aviso, cancela. Vuelve a desactivarlo y confirma. Sal y vuelve a entrar.
3. Abre el ✎ del grupo (Editar grupo).
4. Como admin de un ayuntamiento, abre sus Ajustes.

**Esperado:** Paso 1: cinco apartados con su título en mayúsculas — «Entrar al grupo» (aprobación con su explicación, pedir teléfono, pedir email), «Qué ven todos los socios» (lista de socios, cuota, avisos y cuentas públicas), «Charla», «Cosateca», «Cuota» (recordatorios) — cada uno en su tarjeta. Paso 2: al cancelar sigue activado; al confirmar queda «Cualquiera puede unirse al momento» y se mantiene al volver. Paso 3: ya no aparece el interruptor de aprobación; guardar no lo cambia. Paso 4: sin «Entrar al grupo» ni «Qué ven todos los socios»; solo Charla y Cosateca.

**Roto se ve así:** los interruptores siguen en una sola lista sin títulos; el interruptor de aprobación sigue en Editar grupo o falta en Ajustes; o al guardar Editar grupo el grupo vuelve a pedir aprobación.
