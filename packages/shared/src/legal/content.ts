import { CURRENT_TERMS_VERSION } from '../models/user';

/**
 * Source of truth for the in-app legal documents. Transcribed verbatim from
 * docs/legal/politica-de-privacidad.md and docs/legal/terminos-de-uso.md —
 * keep the two in sync when either changes, and bump CURRENT_TERMS_VERSION on a
 * substantive change (it re-prompts new acceptances). Bullet lines carry a
 * leading "•"; everything else is a paragraph.
 */
export interface LegalSection {
  heading: string;
  body: string[];
}

export interface LegalDoc {
  title: string;
  updated: string;
  version: string;
  intro: string[];
  sections: LegalSection[];
}

const updated = '20 de noviembre de 2026';

const privacy: LegalDoc = {
  title: 'Política de privacidad',
  updated,
  version: CURRENT_TERMS_VERSION,
  intro: [
    'La presente Política de Privacidad regula el tratamiento de los datos personales de las personas usuarias de Cultuvilla (en adelante, la "Aplicación" o el "Servicio"). Al registrarte y utilizar el Servicio aceptas el tratamiento de tus datos en los términos aquí descritos.',
    'El Servicio se presta a través de las aplicaciones de Cultuvilla para iOS y Android. La web cultuvilla.es es un sitio público de lectura, que incluye el formulario para quien quiere ser Embajador o Embajadora de su pueblo y el estudio de redacción (/estudio), al que se entra vinculándolo con la Aplicación. Esta política se aplica a todos ellos.',
  ],
  sections: [
    {
      heading: '1. Responsable del tratamiento',
      body: [
        'Titular: Álvaro Francisco Gil',
        'NIF: 50242222X',
        'Dirección postal: Plaza Manuel Mateo 11, 28044 Madrid, España',
        'Correo de contacto: cultuvilla.app@gmail.com',
        'Puedes dirigirte a la dirección de correo indicada para cualquier cuestión relativa al tratamiento de tus datos personales o para el ejercicio de tus derechos.',
      ],
    },
    {
      heading: '2. Datos que tratamos',
      body: [
        'Tratamos únicamente los datos necesarios para prestar el Servicio:',
        'a) Datos de cuenta',
        '• Dirección de correo electrónico: es tu identificador de acceso. Entras con un código de 6 dígitos que te enviamos por correo, con tu cuenta de Google o, en iPhone, con tu cuenta de Apple. Si usas Google o Apple, recibimos de ese proveedor tu correo y el identificador de tu cuenta.',
        '• Número de teléfono, cuando lo facilitas.',
        'b) Datos de perfil ("persona")',
        '• Nombre y apellidos.',
        '• Sexo.',
        '• Fecha de nacimiento.',
        '• Lugar de nacimiento.',
        '• Biografía (texto libre que decides aportar).',
        '• Fotografía de perfil, cuando la subes.',
        '• Pueblo y barrio de residencia.',
        '• Apodo y oficios, cuando los indicas.',
        '• En los perfiles de familiares, también la fecha de fallecimiento y el lugar de enterramiento, cuando se trata de familiares fallecidos.',
        'El perfil de persona de quien tiene cuenta es visible para las demás personas usuarias del Servicio. Quien crea el perfil de un familiar puede hacerlo privado; aun así, su nombre sigue apareciendo en los listados de vecinos del pueblo. Los perfiles de persona no se publican en la web, salvo el nombre, el primer apellido y la fotografía de quien es Embajador o Embajadora de un pueblo, que aparecen en cultuvilla.es/embajadores.',
        'c) Datos de actividad en la comunidad',
        '• Inscripciones a eventos (propias y de familiares que registres como "personas"), incluidas las respuestas a los campos que la organización del evento añada al formulario de inscripción.',
        '• Pertenencia a pueblos y organizaciones (peñas, asociaciones, ayuntamientos) y el rol que ostentas en ellas.',
        '• En los grupos con lista de socios: tu número de socio y tus fechas de alta y baja, el registro de cuotas que lleva la tesorería (Cultuvilla no cobra ni guarda datos bancarios: los pagos se hacen fuera de la Aplicación), las actas en las que figuras como asistente y, si decides compartirlos con la junta, tu teléfono y tu correo. La junta de un grupo también puede añadir a la lista de socios a personas que no usan la Aplicación, con su nombre y, si lo tiene, su teléfono y su correo; al hacerlo, la junta confirma que cuenta con el permiso de esa persona. Cada grupo es el responsable del tratamiento de los datos de sus socios, y Cultuvilla actúa como encargado del tratamiento por cuenta del grupo.',
        '• Mensajes, tareas y conversaciones de los grupos, y lo que ofreces, prestas o pides en la cosateca.',
        '• Comentarios, denuncias de contenido y personas que bloqueas.',
        '• Solicitudes que envías o gestionas (Embajador o Embajadora de un pueblo, creación de organización, unirte a un grupo) y el registro de auditoría asociado.',
        'd) Ubicación',
        '• Solo si lo autorizas, la Aplicación lee la ubicación de tu dispositivo una vez, para situar un lugar en el mapa. No se lee en segundo plano.',
        'e) Datos técnicos',
        '• El identificador de notificaciones de tu dispositivo, para enviarte avisos push. Se borra al cerrar sesión.',
        '• Estadísticas de uso de la Aplicación, solo si las aceptas: están desactivadas hasta que, con la sesión iniciada, respondes que sí a una pregunta que se hace una sola vez, y puedes cambiarlo cuando quieras en Ajustes → «Estadísticas de uso». Sin sesión iniciada nunca se recogen.',
        '• Informes de errores de la Aplicación, tratados a través de los encargados indicados en el apartado 5.',
        '• Una huella irreversible (hash) de tu dirección IP y de tu correo, para limitar los intentos de acceso.',
        '• En la web, contamos las visitas por tipo de página y de dispositivo, sin guardar la dirección que visitas ni los datos de tu navegador. Los registros técnicos del servidor (Google Cloud Logging) sí incluyen la dirección IP de cada petición y se conservan 30 días.',
        'f) Formulario de Embajadores de la web',
        '• Nombre, teléfono y pueblo de quien pide, desde cultuvilla.es/embajadores, ser Embajador o Embajadora de su pueblo, aunque no tenga cuenta.',
        'No solicitamos ni tratamos categorías especiales de datos (salud, ideología, religión, etc.). Te pedimos que no incluyas ese tipo de información en campos de texto libre como la biografía.',
      ],
    },
    {
      heading: '3. Finalidades del tratamiento',
      body: [
        'Tratamos tus datos para:',
        '1. Crear y gestionar tu cuenta y tu perfil de persona.',
        '2. Permitirte descubrir eventos, inscribirte a ti y a tus familiares, y participar en la vida de tu pueblo y de sus organizaciones.',
        '3. Gestionar la pertenencia a pueblos y organizaciones, los roles de administración y las solicitudes entre usuarias y administraciones.',
        '4. Enviarte notificaciones relacionadas con el Servicio (resultado de solicitudes, inscripciones, cambios relevantes, mensajes de tus grupos), en la Aplicación, por notificación push o por correo electrónico.',
        '5. Mantener la seguridad del Servicio, prevenir abusos y cumplir obligaciones legales.',
        '6. Analizar el uso de la Aplicación y diagnosticar errores para mantener y mejorar el Servicio.',
        '7. Atender las solicitudes para ser Embajador o Embajadora de un pueblo, incluidas las del formulario de la web, y contactar contigo para ello.',
      ],
    },
    {
      heading: '4. Bases jurídicas',
      body: [
        '• Ejecución de un contrato (art. 6.1.b RGPD): la prestación del Servicio que solicitas al registrarte (gestión de cuenta, perfil, eventos, pertenencias).',
        '• Consentimiento (art. 6.1.a RGPD): los datos opcionales que decides aportar (biografía, fotografía, teléfono) y las estadísticas de uso, que solo se activan si respondes que sí cuando la Aplicación te lo pregunta. Puedes retirar tu consentimiento en cualquier momento (las estadísticas, en Ajustes → «Estadísticas de uso»), sin que ello afecte a la licitud del tratamiento previo.',
        '• Interés legítimo (art. 6.1.f RGPD): la seguridad del Servicio, la prevención de abusos y el diagnóstico de errores.',
        '• Cumplimiento de obligaciones legales (art. 6.1.c RGPD): cuando la normativa nos obligue a conservar o comunicar determinada información.',
      ],
    },
    {
      heading: '5. Encargados del tratamiento y terceros',
      body: [
        'Para prestar el Servicio nos apoyamos en proveedores que actúan como encargados del tratamiento, tratando los datos por cuenta del Responsable y bajo contrato conforme al art. 28 RGPD:',
        '• Google Firebase y Google Cloud (Google Ireland Limited / Google LLC): autenticación (incluido el inicio de sesión con Google), base de datos (Firestore), almacenamiento de archivos (Storage), funciones de servidor (Cloud Functions), alojamiento web (Hosting), notificaciones push en Android (Firebase Cloud Messaging) y registro de errores (Cloud Logging). La base de datos se ubica en la Unión Europea (Madrid); el almacenamiento de archivos y parte de las funciones de servidor, en Estados Unidos (ver el apartado 6).',
        '• Google Analytics for Firebase (mismo proveedor): estadísticas de uso de la Aplicación.',
        '• Apple (Apple Distribution International Ltd., Irlanda): inicio de sesión con Apple y notificaciones push en iPhone (Apple Push Notification service).',
        '• Resend (Resend, Inc., Estados Unidos): envío de los correos del Servicio (códigos de acceso, avisos de eventos y mensajes de los grupos).',
        '• Expo (650 Industries, Inc., Estados Unidos): distribución de las actualizaciones de la Aplicación, que recibe datos técnicos del dispositivo cuando la Aplicación busca una actualización.',
        '• El mapa de la Aplicación lo sirve Google Maps en Android y Apple Maps en iPhone.',
        '[PENDIENTE: confirmar que los acuerdos de tratamiento de datos de Resend y Expo están aceptados.]',
        'Cuando alguien pide ser Embajador o Embajadora de un pueblo, el equipo de Cultuvilla recibe un aviso interno que no incluye datos personales: solo que hay una solicitud nueva en ese pueblo y un enlace para revisarla.',
        'Dentro del Servicio, otras personas usuarias ven lo que corresponde a su papel: la organización de un evento ve las inscripciones a él; la junta de un grupo, su lista de socios y los datos de contacto que hayas decidido compartir (de esos datos, el grupo es el responsable y Cultuvilla, el encargado); y el equipo de un pueblo, las solicitudes y el registro de auditoría de ese pueblo. El contenido público de los pueblos (eventos, noticias, lugares, organizaciones) también se muestra en la web, sin necesidad de cuenta.',
        'No vendemos ni cedemos tus datos personales a terceros con fines comerciales. Solo se comunicarán datos a terceros cuando exista una obligación legal.',
      ],
    },
    {
      heading: '6. Transferencias internacionales',
      body: [
        'Parte del tratamiento se realiza fuera del Espacio Económico Europeo: los archivos (por ejemplo, las fotografías) se almacenan en Estados Unidos, y parte de las funciones de servidor —entre ellas las de inicio de sesión y eliminación de cuenta— se ejecutan allí. Resend y Expo tienen sede en Estados Unidos; con ellos, las transferencias se amparan en las cláusulas contractuales tipo del proveedor o en el Marco de Privacidad de Datos UE-EE. UU., según corresponda. Cuando un tratamiento implique una transferencia de datos fuera del Espacio Económico Europeo, esta se ampara en las garantías previstas en el RGPD (decisiones de adecuación o cláusulas contractuales tipo aprobadas por la Comisión Europea).',
      ],
    },
    {
      heading: '7. Plazos de conservación',
      body: [
        'Conservamos tus datos mientras tu cuenta permanezca activa. Cuando eliminas tu cuenta, tus datos personales se suprimen o anonimizan, salvo aquellos que debamos conservar durante el plazo legalmente exigible (por ejemplo, registros de auditoría), que se mantendrán únicamente durante ese periodo y con acceso restringido. En los grupos con lista de socios, se borran el teléfono y el correo que compartiste con la junta; tu ficha de socio (nombre, número y fechas de alta y baja) se queda en el libro de socios del grupo, marcada como baja.',
      ],
    },
    {
      heading: '8. Tus derechos',
      body: [
        'Puedes ejercer, de forma gratuita, los siguientes derechos escribiendo a cultuvilla.app@gmail.com:',
        '• Acceso a tus datos personales.',
        '• Rectificación de datos inexactos.',
        '• Supresión ("derecho al olvido").',
        '• Oposición al tratamiento.',
        '• Limitación del tratamiento.',
        '• Portabilidad de los datos que nos hayas facilitado.',
        '• Retirada del consentimiento en cualquier momento.',
        'Muchas de estas acciones puedes realizarlas directamente desde la Aplicación (editar tu perfil, eliminar tu cuenta). Si consideras que tus derechos no han sido debidamente atendidos, tienes derecho a reclamar ante la Agencia Española de Protección de Datos (AEPD), C/ Jorge Juan 6, 28001 Madrid — www.aepd.es.',
      ],
    },
    {
      heading: '9. Menores de edad',
      body: [
        'La edad mínima para registrarse por cuenta propia es de 14 años, conforme al artículo 7 de la Ley Orgánica 3/2018 (LOPDGDD). Las personas menores de 14 años solo pueden utilizar el Servicio con el consentimiento de quienes ostenten su patria potestad o tutela. Los datos de familiares menores registrados como "personas" son aportados y gestionados bajo la responsabilidad de la persona adulta que los registra.',
      ],
    },
    {
      heading: '10. Seguridad',
      body: [
        'Aplicamos medidas técnicas y organizativas razonables para proteger tus datos frente a accesos no autorizados, pérdida o alteración, incluyendo el control de acceso por reglas de seguridad en la base de datos y la minimización de los datos tratados.',
      ],
    },
    {
      heading: '11. Cambios en esta política',
      body: [
        'Podemos actualizar esta Política de Privacidad para reflejar cambios legales o del Servicio. Cuando el cambio sea sustancial, incrementaremos el número de versión y te lo comunicaremos por los medios habituales, pudiendo solicitarte una nueva aceptación.',
      ],
    },
  ],
};

const terms: LegalDoc = {
  title: 'Términos de uso',
  updated,
  version: CURRENT_TERMS_VERSION,
  intro: [
    'Los presentes Términos de Uso (los "Términos") regulan el acceso y la utilización de Cultuvilla (la "Aplicación" o el "Servicio"). Al registrarte y utilizar el Servicio declaras haber leído y aceptado estos Términos y la Política de Privacidad. Si no estás de acuerdo, no utilices el Servicio.',
  ],
  sections: [
    {
      heading: '1. Identificación del prestador',
      body: [
        'En cumplimiento de la Ley 34/2002 de Servicios de la Sociedad de la Información y de Comercio Electrónico (LSSI-CE):',
        'Titular: Álvaro Francisco Gil',
        'NIF: 50242222X',
        'Dirección postal: Plaza Manuel Mateo 11, 28044 Madrid, España',
        'Correo de contacto: cultuvilla.app@gmail.com',
      ],
    },
    {
      heading: '2. Descripción del Servicio',
      body: [
        'Cultuvilla es una plataforma para las comunidades de pueblos de España. Las organizaciones (ayuntamientos, peñas, asociaciones) publican eventos; las personas residentes y visitantes los descubren, se inscriben a sí mismas y a sus familiares, y las administraciones de cada pueblo gestionan invitaciones y aprobaciones de organizaciones. Los grupos gestionan además sus integrantes y socios, cuotas, mensajes, tareas y cosateca.',
        'El Servicio se presta a través de las aplicaciones de Cultuvilla para iOS y Android. La web cultuvilla.es es un sitio público de lectura de la información de los pueblos, accesible sin cuenta; en ella también está el estudio de redacción (/estudio), al que se entra vinculándolo con la Aplicación. Nos reservamos el derecho a modificar, ampliar o suspender total o parcialmente las funcionalidades del Servicio.',
      ],
    },
    {
      heading: '3. Requisitos de acceso',
      body: [
        '• Debes tener al menos 14 años para registrarte por cuenta propia. Las personas menores de 14 años solo pueden usar el Servicio con el consentimiento de quienes ostenten su patria potestad o tutela.',
        '• La información que facilites debe ser veraz, exacta y actualizada. Eres responsable de mantener actualizados los datos de tu cuenta y de tu perfil.',
        '• Eres responsable de la actividad realizada desde tu cuenta.',
      ],
    },
    {
      heading: '4. Registro y autenticación',
      body: [
        'El acceso se realiza sin contraseña: con un código de 6 dígitos que te enviamos a tu correo electrónico, con tu cuenta de Google o, en iPhone, con tu cuenta de Apple. El estudio de redacción de la web no tiene cuentas propias: se abre vinculándolo desde la Aplicación, con la sesión que ya tienes en ella. Debes conservar el control de tu cuenta de correo, de Google o de Apple asociada, ya que quien tenga acceso a ella podrá acceder a tu cuenta en el Servicio. Notifícanos de inmediato cualquier uso no autorizado.',
      ],
    },
    {
      heading: '5. Uso aceptable',
      body: [
        'Te comprometes a utilizar el Servicio conforme a la ley, a estos Términos y a la buena fe. En particular, no está permitido:',
        '• Publicar contenido ilícito, difamatorio, injurioso, discriminatorio, violento, obsceno o que vulnere derechos de terceros.',
        '• Suplantar la identidad de otra persona, organización o administración pública.',
        '• Introducir datos falsos, o registrar personas o eventos inexistentes o engañosos.',
        '• Recopilar datos de otras personas usuarias sin su consentimiento.',
        '• Interferir en el funcionamiento del Servicio, eludir sus medidas de seguridad, o realizar accesos automatizados no autorizados.',
        '• Utilizar el Servicio con fines comerciales no autorizados o para el envío de comunicaciones no solicitadas.',
      ],
    },
    {
      heading: '6. Contenido de las personas usuarias',
      body: [
        'Eres responsable del contenido que publicas (perfiles, eventos, noticias, imágenes, comentarios, mensajes de grupo, lo que ofreces en la cosateca y demás aportaciones). Al publicar contenido garantizas que dispones de los derechos necesarios para ello, incluida la autorización de las personas que aparezcan en las imágenes que subas.',
        'Nos concedes una licencia no exclusiva, gratuita y limitada para alojar, reproducir y mostrar dicho contenido con la única finalidad de prestar y promocionar el Servicio en la app, en su web pública y en las vistas previas de enlaces y en buscadores. Conservas la titularidad de tu contenido.',
        'El contenido público de los pueblos (eventos, noticias, lugares, organizaciones) se muestra también en la web cultuvilla.es, accesible sin cuenta y por los buscadores, y en las vistas previas de los enlaces que se comparten.',
        'Cualquier persona usuaria puede denunciar un comentario o bloquear a otra persona; el equipo del pueblo revisa las denuncias y puede ocultar el contenido.',
        'Podemos retirar contenido que infrinja estos Términos o la legislación aplicable.',
      ],
    },
    {
      heading: '7. Roles, pueblos y organizaciones',
      body: [
        'Determinadas funciones (administración de un pueblo, gestión de una organización, aprobación de solicitudes) se asocian a roles otorgados a través de los mecanismos del Servicio. Quien ostente un rol de administración se compromete a ejercerlo de forma diligente y conforme a estos Términos. La concesión, modificación o retirada de roles queda registrada para garantizar la trazabilidad.',
      ],
    },
    {
      heading: '8. Propiedad intelectual',
      body: [
        'El software, el diseño, las marcas y los elementos de la Aplicación (excluido el contenido aportado por las personas usuarias) pertenecen al prestador o a sus licenciantes y están protegidos por la normativa de propiedad intelectual e industrial. No se concede ningún derecho sobre ellos más allá del uso del Servicio conforme a estos Términos.',
      ],
    },
    {
      heading: '9. Disponibilidad y exención de responsabilidad',
      body: [
        'El Servicio se presta "tal cual" y "según disponibilidad". En la medida permitida por la ley, no garantizamos que el Servicio esté libre de errores o interrupciones. No somos responsables de:',
        '• El contenido publicado por las personas usuarias ni de la veracidad de la información sobre eventos, organizaciones o pueblos.',
        '• Los daños derivados del uso indebido del Servicio por parte de la persona usuaria.',
        '• Las interrupciones o fallos ajenos a nuestro control razonable.',
        'Nada en estos Términos excluye la responsabilidad que legalmente no pueda excluirse.',
      ],
    },
    {
      heading: '10. Suspensión y baja',
      body: [
        'Puedes darte de baja y eliminar tu cuenta en cualquier momento desde la Aplicación. Podemos suspender o cancelar el acceso de una cuenta que incumpla estos Términos o la legislación aplicable, con notificación cuando sea posible.',
      ],
    },
    {
      heading: '11. Modificaciones de los Términos',
      body: [
        'Podemos modificar estos Términos para adaptarlos a cambios legales o del Servicio. Cuando el cambio sea sustancial, incrementaremos el número de versión y te lo comunicaremos, pudiendo solicitarte una nueva aceptación para seguir utilizando el Servicio.',
      ],
    },
    {
      heading: '12. Ley aplicable y jurisdicción',
      body: [
        'Estos Términos se rigen por la legislación española. Para la resolución de cualquier controversia, las partes se someten a los juzgados y tribunales que resulten competentes conforme a la normativa aplicable, respetando en todo caso el fuero que corresponda a las personas consumidoras.',
      ],
    },
  ],
};

/**
 * Public account-deletion instructions. Google Play's Data safety form requires
 * a *web* URL where a person can find out how to delete their account and their
 * data, separate from the in-app path — this doc is that URL
 * (https://cultuvilla.es/legal/eliminar-cuenta) and it is why the screen exists
 * outside the signed-in area.
 */
const accountDeletion: LegalDoc = {
  title: 'Eliminar tu cuenta',
  updated,
  version: CURRENT_TERMS_VERSION,
  intro: [
    'Puedes eliminar tu cuenta de Cultuvilla y los datos asociados en cualquier momento, desde la propia aplicación o escribiéndonos.',
  ],
  sections: [
    {
      heading: 'Desde la aplicación',
      body: [
        '• Abre el menú y entra en Ajustes.',
        '• Pulsa "Eliminar cuenta".',
        '• Confirma la eliminación.',
        'Si eres la única persona del equipo de un pueblo o la única administradora de un grupo, la Aplicación te pedirá antes que nombres a otra.',
        'La eliminación es inmediata y definitiva: no hay periodo de recuperación.',
      ],
    },
    {
      heading: 'Por correo',
      body: [
        'Si no puedes acceder a la aplicación, escribe a cultuvilla.app@gmail.com desde la dirección de correo de tu cuenta y la eliminaremos por ti. Responderemos en un plazo máximo de 30 días.',
      ],
    },
    {
      heading: 'Qué se elimina',
      body: [
        '• Tu cuenta de acceso y tu correo electrónico.',
        '• Tu perfil de persona: nombre, fecha y lugar de nacimiento, biografía y fotografía.',
        '• Los perfiles de familiares que hayas creado y que no tengan cuenta propia.',
        '• Tu pertenencia a pueblos y organizaciones, y tus inscripciones a eventos.',
        '• Tus comentarios y tus mensajes en las conversaciones de los grupos: se borran por completo, no se anonimizan.',
        '• Lo que ofreces o pides en la cosateca.',
        '• Tus notificaciones, tus preferencias de avisos y los dispositivos registrados para recibir notificaciones push.',
        '• Las fotografías que hayas subido.',
        'Los eventos y las noticias que hayas publicado sí se conservan, pero dejan de estar asociados a tu identidad: pasan a figurar como publicados por un usuario eliminado. Son información de la vida del pueblo que otras personas necesitan, y el contenido publicado en nombre de una organización sigue perteneciendo a esa organización.',
      ],
    },
    {
      heading: 'Qué se conserva y durante cuánto tiempo',
      body: [
        'Registro de auditoría de administradores: cada alta, baja o cambio de rol en un pueblo u organización deja una entrada en un registro interno. Guarda tu identificador de usuario —nunca tu nombre ni tu correo— y se conserva mientras exista ese pueblo u organización, con acceso restringido a sus administradores.',
        'Registros técnicos de seguridad y diagnóstico: se conservan un máximo de 30 días y después se suprimen automáticamente.',
        'Libro de socios: en los grupos con lista de socios, se borran el teléfono y el correo que compartiste con la junta, pero tu ficha de socio (nombre, número y fechas de alta y baja) se queda en el libro de socios del grupo, marcada como baja.',
        'No conservamos ningún otro dato personal tuyo. Ver la Política de privacidad para el detalle.',
      ],
    },
  ],
};

export const LEGAL_DOCS: { terms: LegalDoc; privacy: LegalDoc; accountDeletion: LegalDoc } = {
  terms,
  privacy,
  accountDeletion,
};
