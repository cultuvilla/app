---
verifier: agent
accounts: admin
platform: any
data: seed
source: feat/ledger-categories
---

# Las cuentas del grupo eligen categoría de una lista, con «+ Nueva»

**Preparación:** Como admin de una asociación o peña con libro de socios (la de la semilla e2e vale). Registros → Cuentas. Si el grupo no tiene anotaciones, anota antes un gasto escribiendo nada en categoría: hace falta al menos una anotación antigua con categoría para el paso 3 (en un grupo de antes de este cambio la habrá; si no, sáltalo).

**Pasos:**

1. «Anotar ingreso o gasto». Con «Gasto» marcado, toca «+ Nueva», escribe «Orquesta» y «Añadir». El chip «Orquesta» queda elegido. Rellena importe y concepto y «Anotar».
2. Vuelve a abrir la hoja. «Orquesta» sale como chip. Cambia a «Ingreso»: «Orquesta» desaparece. Vuelve a «Gasto», toca «+ Nueva» y escribe «orquesta» en minúsculas: no aparece un segundo chip, se elige el mismo.
3. Una categoría que solo llevaban anotaciones antiguas sale también como chip; elegirla la añade a la lista (luego aparece en «Categorías»).
4. Anota sin tocar ningún chip: la anotación sale como «Sin categoría».
5. Toca «Categorías» bajo «Anotaciones». Renombra «Orquesta» a «Música». Intenta renombrar otra a «música»: «Ya hay una categoría con ese nombre». Borra una (pide confirmación).

**Esperado:** Las anotaciones ya hechas siguen diciendo «Orquesta» tras el renombre y el borrado; solo lo que se anote después usa «Música». Un integrante que no es admin no ve «Categorías» ni la lista.

**Roto se ve así:** el campo de texto libre de antes; chips de ingresos en un gasto; dos chips «Orquesta»/«orquesta»; una anotación antigua que cambia de nombre al renombrar; texto con llaves o claves `groups.records…`.
