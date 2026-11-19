---
verifier: agent
accounts: none
platform: any
data: seed
source: fix/legal-texts-refresh
---
# Los textos legales describen la app de hoy

**Preparación:** App abierta sin sesión; y la web de lectura del mismo entorno.

**Pasos:**
1. En la app, abre Términos de uso (desde la pantalla de entrar o el menú).
2. Abre la Política de privacidad.
3. Abre «Eliminar tu cuenta» (/legal/eliminar-cuenta).
4. En la web, abre /legal/terminos y /legal/privacidad.

**Esperado:** Todas muestran «Actualizado el 20 de noviembre de 2026». Términos §2 habla de las apps para iOS y Android y de la web como sitio de lectura con /estudio; §4 habla del código de 6 dígitos, Google y Apple. Privacidad §2 a) igual, y §5 lista Resend, Telegram, Apple y Expo y ya no menciona Crashlytics ni «la infraestructura se ubica en la UE». Eliminar cuenta menciona el aviso de nombrar a otra persona si eres la única del equipo. Las notas [PENDIENTE: …] se ven tal cual (el PR no se fusiona hasta que Álvaro las resuelva).

**Roto se ve así:** aparece «enlace mágico», «versión web» o «Crashlytics», o la fecha sigue siendo el 10 de julio de 2026.
