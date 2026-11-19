---
verifier: agent
accounts: fresh
platform: any
data: seed
source: fix/signup-surname-resend
---
# «Reenviar código» confirma el envío y vacía el código viejo

**Preparación:** Pantalla de acceso, con un correo escrito y el código ya enviado (paso del código).

**Pasos:**
1. Escribe un código cualquiera en `login-code-input`.
2. Pulsa «Reenviar código» (`login-resend-code`).
3. Empieza a escribir el código nuevo.
4. Pulsa «Reenviar código» varias veces seguidas hasta llegar al límite de envíos.

**Esperado:** Paso 2: aparece «Código enviado» en verde bajo el campo (`login-code-resent`), sin ventana emergente, y el campo queda vacío; llega un correo/código nuevo. Paso 3: el aviso desaparece. Paso 4: al pasar el límite se ve el mensaje de error de siempre en rojo, sin «Código enviado», y el código escrito se mantiene.

**Roto se ve así:** al reenviar no cambia nada en pantalla y el código viejo sigue en el campo; o sale «Código enviado» aunque el envío haya fallado.
