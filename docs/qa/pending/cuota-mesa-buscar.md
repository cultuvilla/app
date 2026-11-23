---
verifier: agent
accounts: admin
platform: any
data: seed
source: develop
---
# Cobrar en la mesa dice que hay que buscar

**Preparación:** Entra como admin de la asociación de la semilla (`e2e-org-asociacion`) con la cuota configurada. Abre Cobros.

**Pasos:**
1. Toca «Cobrar en la mesa».
2. Escribe parte del nombre de un socio.

**Esperado:** En el paso 1 el teclado se abre solo, el campo tiene encima «¿Quién paga?», una lupa a la derecha y dentro «Busca por nombre o nº de socio», y debajo un aviso que explica que hay que escribir el nombre o el número y luego tocar cómo ha pagado. En el paso 2 el aviso desaparece y salen los socios que coinciden.

**Roto se ve así:** La hoja se abre con un campo sin título y el resto en blanco, sin nada que diga que hay que buscar.
