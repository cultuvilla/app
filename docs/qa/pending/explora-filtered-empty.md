---
verifier: agent
accounts: any
platform: any
data: seed
source: fix/explora-filtered-empty
---
# Explora distingue «no hay nada» de «nada coincide con tus filtros»

**Preparación:** Cualquier cuenta (o invitado) con el seed de demo, que tiene eventos y artículos próximos.

**Pasos:**
1. Abre Explora en Eventos. Toca Buscar y escribe «zzzz».
2. Toca «Quitar filtros».
3. Elige en Fecha «Hoy» y en Pueblo uno sin eventos hoy (o cualquier combinación que deje la lista vacía).
4. Cambia a Artículos, busca «zzzz» y toca «Quitar filtros».

**Esperado:** Paso 1: la lista queda vacía con una lupa y «Ningún evento coincide con tu búsqueda o tus filtros.», y debajo el botón «Quitar filtros». Paso 2: la búsqueda se cierra, todos los filtros vuelven a su valor por defecto y reaparecen los eventos. Paso 3: el mismo mensaje y botón. Paso 4: «Ningún artículo coincide con tu búsqueda o tus filtros.»; al quitar filtros vuelven los artículos. Sin ningún filtro y sin eventos, sigue saliendo «No hay eventos próximos», sin botón.

**Roto se ve así:** con un filtro activo y la lista vacía sale «No hay eventos próximos» (o «Aún no hay artículos en tu pueblo.»); falta el botón; o el botón deja algún filtro puesto.
