---
verifier: agent
accounts: fresh+user
platform: any
data: seed
source: fix/analytics-consent
---
# Las estadísticas de uso se piden una vez, se pueden cambiar en Ajustes y nunca vienen marcadas

**Preparación:** Seed de e2e. La cuenta `fresh` no tiene perfil. Para la cuenta ya existente, borra en el emulador `users/<uid>/privacySettings/account` de un usuario sembrado (p. ej. `e2e-attendee`) para simular a alguien que nunca contestó.

**Pasos:**
1. Entra con `fresh`. En el primer paso de «Completa tu perfil», debajo de los términos, mira la pregunta «¿Nos ayudas a mejorar Cultuvilla con estadísticas de uso anónimas?». Pulsa «No» y termina el registro.
2. Ve a Menú → Ajustes.
3. Pulsa el interruptor «Estadísticas de uso»; sal de Ajustes y vuelve.
4. Cierra sesión y entra con la cuenta sembrada sin respuesta.
5. Cierra la hoja arrastrándola hacia abajo; cierra la app y vuelve a abrirla.
6. Contesta «Sí» en la hoja; cierra la app y vuelve a abrirla.

**Esperado:** Paso 1: ni «Sí» ni «No» vienen marcados, los dos botones son iguales; tras registrarte no aparece ninguna hoja preguntándolo otra vez y existe `users/<uid>/privacySettings/account` con `usageAnalytics: false`. Paso 2: apartado «Privacidad» con «Estadísticas de uso» apagado y una línea que explica para qué sirven. Paso 3: queda encendido al volver y el documento dice `true`. Paso 4: al llegar a Explora sube una hoja con la misma pregunta y «Sí» / «No» iguales. Paso 5: no se guarda nada y la hoja vuelve a salir al reabrir. Paso 6: se guarda `true` y la hoja no vuelve a salir.

**Roto se ve así:** una opción viene ya marcada o «No» se ve menos que «Sí»; la hoja sale a quien ya contestó (también justo después de registrarse); el interruptor no guarda o no refleja lo guardado; o la hoja aparece a un invitado sin sesión.
