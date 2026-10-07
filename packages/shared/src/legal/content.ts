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

const updated = '10 de julio de 2026';

const privacy: LegalDoc = {
  title: 'Política de privacidad',
  updated,
  version: CURRENT_TERMS_VERSION,
  intro: [
    'La presente Política de Privacidad regula el tratamiento de los datos personales de las personas usuarias de Cultuvilla (en adelante, la "Aplicación" o el "Servicio"). Al registrarte y utilizar el Servicio aceptas el tratamiento de tus datos en los términos aquí descritos.',
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
        '• Dirección de correo electrónico (identificador de acceso, mediante enlace mágico o inicio de sesión con Google).',
        '• Número de teléfono, cuando lo facilitas.',
        'b) Datos de perfil ("persona")',
        '• Nombre y apellidos.',
        '• Sexo.',
        '• Fecha de nacimiento.',
        '• Lugar de nacimiento.',
        '• Biografía (texto libre que decides aportar).',
        '• Fotografía de perfil, cuando la subes.',
        '• Pueblo y barrio de residencia.',
        'c) Datos de actividad en la comunidad',
        '• Inscripciones a eventos (propias y de familiares que registres como "personas").',
        '• Pertenencia a pueblos y organizaciones (peñas, asociaciones, ayuntamientos) y el rol que ostentas en ellas.',
        '• Solicitudes que envías o gestionas (organizador, creación de organización) y el registro de auditoría asociado.',
        'd) Datos técnicos',
        '• Datos de uso y diagnóstico generados por el funcionamiento de la Aplicación (por ejemplo, informes de errores y estadísticas de uso agregadas), tratados a través de los encargados indicados en el apartado 5.',
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
        '4. Enviarte notificaciones relacionadas con el Servicio (resultado de solicitudes, inscripciones, cambios relevantes).',
        '5. Mantener la seguridad del Servicio, prevenir abusos y cumplir obligaciones legales.',
        '6. Analizar el uso de la Aplicación y diagnosticar errores para mantener y mejorar el Servicio.',
      ],
    },
    {
      heading: '4. Bases jurídicas',
      body: [
        '• Ejecución de un contrato (art. 6.1.b RGPD): la prestación del Servicio que solicitas al registrarte (gestión de cuenta, perfil, eventos, pertenencias).',
        '• Consentimiento (art. 6.1.a RGPD): los datos opcionales que decides aportar (biografía, fotografía, teléfono) y las estadísticas de uso no imprescindibles. Puedes retirar tu consentimiento en cualquier momento, sin que ello afecte a la licitud del tratamiento previo.',
        '• Interés legítimo (art. 6.1.f RGPD): la seguridad del Servicio, la prevención de abusos y el diagnóstico de errores.',
        '• Cumplimiento de obligaciones legales (art. 6.1.c RGPD): cuando la normativa nos obligue a conservar o comunicar determinada información.',
      ],
    },
    {
      heading: '5. Encargados del tratamiento y terceros',
      body: [
        'Para prestar el Servicio nos apoyamos en proveedores que actúan como encargados del tratamiento, tratando los datos por cuenta del Responsable y bajo contrato conforme al art. 28 RGPD:',
        '• Google Firebase (Google Ireland Limited / Google LLC): autenticación, base de datos (Firestore), almacenamiento de archivos (Storage), funciones de servidor (Cloud Functions) y alojamiento web (Hosting). La infraestructura utilizada se ubica en la Unión Europea.',
        '• Google Analytics for Firebase y Firebase Crashlytics (mismo proveedor): estadísticas de uso e informes de errores para el mantenimiento y mejora del Servicio.',
        'No vendemos ni cedemos tus datos personales a terceros con fines comerciales. Solo se comunicarán datos a terceros cuando exista una obligación legal.',
      ],
    },
    {
      heading: '6. Transferencias internacionales',
      body: [
        'Nuestro proveedor pertenece a un grupo con presencia internacional. Cuando un tratamiento implique una transferencia de datos fuera del Espacio Económico Europeo, esta se ampara en las garantías previstas en el RGPD (decisiones de adecuación o cláusulas contractuales tipo aprobadas por la Comisión Europea).',
      ],
    },
    {
      heading: '7. Plazos de conservación',
      body: [
        'Conservamos tus datos mientras tu cuenta permanezca activa. Cuando eliminas tu cuenta, tus datos personales se suprimen o anonimizan, salvo aquellos que debamos conservar durante el plazo legalmente exigible (por ejemplo, registros de auditoría), que se mantendrán únicamente durante ese periodo y con acceso restringido.',
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
        'Cultuvilla es una plataforma para las comunidades de pueblos de España. Las organizaciones (ayuntamientos, peñas, asociaciones) publican eventos; las personas residentes y visitantes los descubren, se inscriben a sí mismas y a sus familiares, y las administraciones de cada pueblo gestionan invitaciones y aprobaciones de organizaciones.',
        'El Servicio se presta actualmente a través de su versión web. Nos reservamos el derecho a modificar, ampliar o suspender total o parcialmente las funcionalidades del Servicio.',
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
        'El acceso se realiza sin contraseña, mediante enlace de acceso enviado a tu correo electrónico ("enlace mágico") o mediante inicio de sesión con Google. Debes conservar el control de tu cuenta de correo o de Google asociada, ya que quien tenga acceso a ella podrá acceder a tu cuenta en el Servicio. Notifícanos de inmediato cualquier uso no autorizado.',
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
        'Eres responsable del contenido que publicas (perfiles, eventos, noticias, imágenes, comentarios y demás aportaciones). Al publicar contenido garantizas que dispones de los derechos necesarios para ello, incluida la autorización de las personas que aparezcan en las imágenes que subas.',
        'Nos concedes una licencia no exclusiva, gratuita y limitada para alojar, reproducir y mostrar dicho contenido con la única finalidad de prestar y promocionar el Servicio dentro de la propia plataforma. Conservas la titularidad de tu contenido.',
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
        '• Tus comentarios: se borran por completo, no se anonimizan.',
        '• Las fotografías que hayas subido.',
        'Los eventos y las noticias que hayas publicado sí se conservan, pero dejan de estar asociados a tu identidad: pasan a figurar como publicados por un usuario eliminado. Son información de la vida del pueblo que otras personas necesitan, y el contenido publicado en nombre de una organización sigue perteneciendo a esa organización.',
      ],
    },
    {
      heading: 'Qué se conserva y durante cuánto tiempo',
      body: [
        'Registro de auditoría de administradores: cada alta, baja o cambio de rol en un pueblo u organización deja una entrada en un registro interno. Guarda tu identificador de usuario —nunca tu nombre ni tu correo— y se conserva mientras exista ese pueblo u organización, con acceso restringido a sus administradores.',
        'Registros técnicos de seguridad y diagnóstico: se conservan un máximo de 30 días y después se suprimen automáticamente.',
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
