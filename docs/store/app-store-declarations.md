# App Store Connect — declarations

El equivalente Apple de [play-declarations.md](play-declarations.md). Las
respuestas deben coincidir: dos formularios contradictorios sobre el mismo
binario es exactamente lo que ambas tiendas detectan.

## App Privacy (nutrition labels)

Apple pregunta, por cada tipo de dato: ¿se recoge? ¿se enlaza con la identidad
de la persona? ¿se usa para *tracking* (seguimiento entre apps/webs de terceros)?

**Tracking: NO en todos los casos.** No hay IDFA, no hay `expo-tracking-
transparency`, no hay SDK publicitario ni data broker. Por tanto **no** procede
el prompt de App Tracking Transparency.

| Tipo de dato | Recogido | Enlazado a la identidad | Uso |
|---|---|---|---|
| Contact Info → Name | Sí | Sí | App Functionality |
| Contact Info → Email Address | Sí | Sí | App Functionality |
| Contact Info → Phone Number | Sí | Sí | App Functionality |
| User Content → Photos or Videos | Sí | Sí | App Functionality |
| User Content → Other User Content | Sí | Sí | App Functionality (biografía, comentarios, noticias) |
| Identifiers → User ID | Sí | Sí | App Functionality (uid de Firebase Auth) |
| Location → Coarse + Precise Location | Sí | Sí | App Functionality (pin del pueblo, uso puntual) |
| Usage Data → Product Interaction | Sí | Sí | App Functionality |
| Diagnostics → Crash Data, Other Diagnostic Data | Sí | Sí | App Functionality |
| Sensitive Info | **No** | — | la política de privacidad pide expresamente no volcar categorías especiales en texto libre |

Otros datos que Apple lista y **no** recogemos: Health & Fitness, Financial Info,
Contacts, Search History, Browsing History, Purchases, Audio Data.

**Privacy Policy URL**: `https://cultuvilla.es/legal/privacidad`
**Account deletion**: obligatorio desde 2022 para toda app con registro — existe
(Ajustes → Eliminar cuenta). Indicar la ruta en las notas de revisión.

## Age Rating

Cuestionario ASC. Todas las categorías de contenido (violencia, sexo, sustancias,
juego, terror) en **None**. Las que sí aplican:

- **User Generated Content**: Sí → hay que declarar el mecanismo de **denuncia**
  (bandera en cada comentario ajeno, siete motivos), el de **bloqueo**
  (misma hoja; se deshace en Ajustes → Personas bloqueadas), la revisión por
  administradores (Administración → Denuncias + ocultación de contenido) y el
  contacto de moderación `cultuvilla.app@gmail.com`.
- **Unrestricted Web Access**: No — los enlaces externos abren el navegador del
  sistema, no hay navegador embebido sin restricciones.
- **Frequent/Intense Contests, Gambling**: No.

Calificación esperada: **12+** por UGC (Apple la deriva del cuestionario; no se
elige a mano). No coincidirá con el "18+" declarado como *target audience* en
Play — es correcto: Play pregunta a quién va dirigida, Apple qué contiene.

## App Review Information

- **Sign-in required**: Sí (parcial — el contenido se lee sin cuenta, las
  acciones no). Mismas credenciales e instrucciones que en Play; ver la decisión
  pendiente sobre el buzón de revisión en
  [play-declarations.md](play-declarations.md#app-access-sign-in-details).
- **Contact**: `cultuvilla.app@gmail.com`.
- **Notes** (borrador):

> Cultuvilla es una agenda comunitaria para pueblos españoles. El contenido
> (eventos, noticias, asociaciones) es público y se puede explorar sin cuenta.
> La cuenta sólo se necesita para inscribirse a un evento, unirse a una
> asociación o publicar.
> Inicio de sesión: se introduce el email y se recibe un código de 6 dígitos.
> Credenciales del buzón de prueba en los campos de arriba.
> Eliminación de cuenta: Ajustes → Eliminar cuenta (borrado completo, RGPD).
> El contenido generado por personas usuarias se puede denunciar desde el propio
> comentario y el equipo del pueblo (su Embajador y quien le ayuda) puede ocultarlo.

## Otros formularios

- **Export Compliance**: ya declarado en el binario —
  `ITSAppUsesNonExemptEncryption: false` en el `infoPlist` de
  [app.config.ts](../../apps/mobile/app.config.ts), porque la app sólo usa
  HTTPS/TLS estándar. ASC deja de preguntarlo en cada build.
- **Content Rights**: no se usa contenido de terceros con licencia.
- **Advertising Identifier (IDFA)**: no se usa.
- **Sign in with Apple**: **obligatorio** si se ofrece Google Sign-In como único
  login social de terceros (guideline 4.8). El OTP por email propio *puede*
  eximirnos, pero es una lectura discutida por los revisores. Presupuestar la
  implementación antes de la primera submission de iOS.

## Requisitos de iOS que hoy no están cubiertos

1. Sign in with Apple, si Google Sign-In sigue en pantalla (guideline 4.8).
2. Cuenta/buzón de revisión operativo.
