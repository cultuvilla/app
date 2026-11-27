---
verifier: human
accounts: fresh
platform: any
data: seed
source: feat/delete-account-reauth
---
# Eliminar la cuenta pide volver a entrar si la sesión tiene más de 5 minutos

**Preparación:** Una cuenta de prueba desechable (no la tuya), sin ser la única persona al frente de ningún pueblo o grupo. Entra con ella y espera más de 5 minutos. Repite una vez con una cuenta de correo (código) y otra con Google (o Apple en iPhone).

**Pasos:**
1. Ajustes → Eliminar cuenta, escribe ELIMINAR y pulsa «Eliminar mi cuenta».
2. Cuenta de correo: llega un código al correo; escríbelo y pulsa «Eliminar mi cuenta». Cuenta de Google/Apple: pulsa «Continuar con Google» (o Apple) y elige la misma cuenta.
3. Una vez más con otra cuenta, pero cierra la hoja de Google/Apple sin elegir.

**Esperado:** En el paso 1 la pantalla dice «Por seguridad, confirma que eres tú…» y no borra nada. Tras el paso 2 la cuenta se elimina y la app vuelve a la pantalla de entrada. En el paso 3 la pantalla se queda igual, sin mensaje de error, y la cuenta sigue existiendo. Con una sesión recién iniciada (menos de 5 minutos) la cuenta se elimina en el paso 1 sin pedir nada.

**Roto se ve así:** Sale «No pudimos eliminar tu cuenta» en el paso 1; el código no llega o no se acepta; tras confirmar la identidad no se elimina la cuenta; o cerrar la hoja muestra un error.
