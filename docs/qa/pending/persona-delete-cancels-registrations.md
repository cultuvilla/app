---
verifier: agent
accounts: fresh
platform: any
data: seed
source: fix/persona-delete-cancels-registrations
---
# Borrar una persona cancela sus inscripciones a eventos próximos

**Preparación:** Un evento próximo con inscripción y aforo de 1 plaza. La cuenta A tiene una persona a su cargo (p. ej. «Ana»); la cuenta B es otra cuenta.

**Pasos:**
1. Con A, apunta a «Ana» al evento (ocupa la única plaza).
2. Con B, apúntate al mismo evento: quedas en lista de espera.
3. Con A, ve a Perfil → «Ana» → borra la persona.
4. Abre el evento con A y con B.

**Esperado:** «Ana» ya no aparece en la lista de asistentes. B pasa de la lista de espera a confirmado (y recibe el aviso de plaza). A recibe el correo de cancelación de «Ana». El contador de inscritos baja y vuelve a subir con B.

**Roto se ve así:** «Ana» sigue en la lista de asistentes tras borrarla, o B sigue en lista de espera con la plaza ocupada por alguien que ya no existe.
