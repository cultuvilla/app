---
verifier: agent
accounts: admin
platform: any
data: seed
source: fix/count-plurals-rest
---
# Los contadores de grupos y eventos van en singular cuando hay uno

**Preparación:** Como admin de una asociación con socios, cuota, avisos y tareas (p. ej. Museros en dev). Un evento con una sola persona apuntada.

**Pasos:**
1. Publica un aviso con encuesta y vota con una sola persona; mira los resultados (también en la vista pública de avisos si está activada).
2. En Cuota (admin), con un solo socio que haya pagado, mira el resumen.
3. Crea una tarea de turno con 1 plaza; apúntate y luego intenta bajar las plazas a 0 en la tarea con alguien apuntado.
4. Mira «Tareas por evento» con un evento que tenga una sola tarea.
5. En el evento con una persona apuntada, pulsa «Exportar asistentes».

**Esperado:** Paso 1: «1 voto». Paso 2: «de 1 pagada». Paso 3: «0 de 1 plaza» antes de apuntarte; al bajar las plazas, «Ya hay 1 apuntado: no puede haber menos plazas.». Paso 4: «0 de 1 hecha». Paso 5: «Se generará la lista completa (1 persona)…».

**Roto se ve así:** se lee «1 votos», «de 1 pagadas», «1 plazas», «1 apuntados», «1 hechas» o «(1 personas)»; o aparece texto con llaves como «{count, plural…».
