import { entityPath, type EntityLinkTarget } from '../utils/urls';
/**
 * Branded HTML/text templates for the event-registration confirmation email,
 * sent via Resend by the `registerToEvent`, waitlist-promotion and cancellation
 * Cloud Functions. Same constraints as the auth templates
 * (functions/src/auth/authEmailTemplate.ts): hand-written table-based HTML with
 * inline styles, no external CSS/JS, so it survives Gmail/Outlook/Apple Mail's
 * markup stripping.
 *
 * The event flyer is a remote <img>. Gmail proxies it and Outlook/Apple Mail
 * block remote images until the reader opts in, so the email must be complete
 * without it: every fact (title, date, place, who is signed up, capacity) is
 * also in the text below the image, and the img carries a real alt.
 */

import { webOriginForProject } from '../utils/webOrigin';

const FOOTER_TEXT = 'Cultuvilla · cultuvilla.app@gmail.com';

const BRAND_GREEN = '#2f5233';
const PAGE_BG = '#f4f1ec';

export type RegistrationEmailStatus = 'confirmed' | 'waitlisted';

export interface RegistrationEmailAttendee {
  name: string;
  status: RegistrationEmailStatus;
  /** 1-based queue position; only meaningful when status is 'waitlisted'. */
  position: number;
}

/** A seat that no longer exists; there is no status left to report on it. */
export interface CancelledEmailAttendee {
  name: string;
}

interface RegistrationEmailBase {
  eventTitle: string;
  /** Absolute https URL to the event's web route. */
  eventUrl: string;
  /** Storage download URL, or null when the event has no flyer. */
  imageURL: string | null;
  /** Preformatted in Europe/Madrid by the caller (see EVENT_TZ). */
  dateLabel: string;
  locationName: string;
  villageName: string;
}

export type RegistrationEmailKind = RegistrationEmailContent['kind'];

/**
 * 'registration' — the user just signed up. 'waitlist_promotion' — a slot
 * freed up and they moved off the waitlist; same layout, different lead so
 * the reader knows why they got a second email about the same event.
 * 'cancellation' / 'removed' — the seat is gone, either because the reader
 * cancelled it or because an organizer (or the group's owner) did. Two kinds
 * rather than one because "has anulado" is a receipt and "te han dado de
 * baja" is news.
 *
 * The union is load-bearing: a cancelled seat has no capacity to report and
 * no queue position, so the cancellation variants simply do not carry those
 * fields. That makes it impossible for a caller to invent a plausible count
 * for an email that never shows one.
 */
export type RegistrationEmailContent =
  | (RegistrationEmailBase & {
      kind: 'registration' | 'waitlist_promotion';
      attendees: RegistrationEmailAttendee[];
      confirmedCount: number;
      /** null when the event has no capacity limit. */
      maxAttendees: number | null;
    })
  | (RegistrationEmailBase & {
      kind: 'cancellation' | 'removed';
      attendees: CancelledEmailAttendee[];
    });

function isCancellation(
  content: RegistrationEmailContent,
): content is Extract<RegistrationEmailContent, { kind: 'cancellation' | 'removed' }> {
  return content.kind === 'cancellation' || content.kind === 'removed';
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Absolute URL of the event's web route, on the env's public origin — the brand
 * domain on prod, `<projectId>.web.app` elsewhere (see `webOriginForProject`).
 */
export function eventWebUrl(event: EntityLinkTarget, projectId: string | undefined): string {
  return `${webOriginForProject(projectId)}${entityPath('event', event)}`;
}

export const REGISTRATION_EMAIL_SUBJECT_PREFIX = 'Inscripción confirmada';
export const PROMOTION_EMAIL_SUBJECT_PREFIX = '¡Plaza confirmada!';
export const CANCELLATION_EMAIL_SUBJECT_PREFIX = 'Inscripción cancelada';
export const REMOVAL_EMAIL_SUBJECT_PREFIX = 'Te han dado de baja';

const SUBJECT_PREFIXES: Record<RegistrationEmailKind, string> = {
  registration: REGISTRATION_EMAIL_SUBJECT_PREFIX,
  waitlist_promotion: PROMOTION_EMAIL_SUBJECT_PREFIX,
  cancellation: CANCELLATION_EMAIL_SUBJECT_PREFIX,
  removed: REMOVAL_EMAIL_SUBJECT_PREFIX,
};

export function registrationEmailSubject(content: RegistrationEmailContent): string {
  return `${SUBJECT_PREFIXES[content.kind]}: ${content.eventTitle}`;
}

const LEAD_LINES: Record<RegistrationEmailKind, string | null> = {
  registration: null,
  waitlist_promotion: 'Se ha liberado una plaza y ya tienes sitio en este evento.',
  cancellation: 'Has anulado tu inscripción en este evento.',
  removed: 'La organización te ha dado de baja de este evento.',
};

function leadLine(content: RegistrationEmailContent): string | null {
  return LEAD_LINES[content.kind];
}

/** "3 de 50 plazas ocupadas", or "3 personas apuntadas" when uncapped. */
export function capacityLabel(confirmedCount: number, maxAttendees: number | null): string {
  if (maxAttendees === null) {
    return confirmedCount === 1
      ? '1 persona apuntada'
      : `${String(confirmedCount)} personas apuntadas`;
  }
  return `${String(confirmedCount)} de ${String(maxAttendees)} plazas ocupadas`;
}

const SEAT_HEADING = 'Tu inscripción';
const CANCELLED_SEAT_HEADING = 'Plazas anuladas';
const CANCEL_HINT = 'Puedes anular tu inscripción desde la página del evento.';
const RESIGNUP_HINT = 'Puedes volver a apuntarte desde la página del evento.';

function attendeeLine(a: RegistrationEmailAttendee): string {
  return a.status === 'confirmed'
    ? `${a.name} — plaza confirmada`
    : `${a.name} — en lista de espera (nº ${String(a.position)})`;
}

/** One line per seat: the sign-up status while it exists, the bare name once it doesn't. */
function attendeeLines(content: RegistrationEmailContent): string[] {
  return isCancellation(content)
    ? content.attendees.map((a) => a.name)
    : content.attendees.map(attendeeLine);
}

export function renderRegistrationEmailHtml(content: RegistrationEmailContent): string {
  const title = escapeHtml(content.eventTitle);
  const url = escapeHtml(content.eventUrl);
  const cancelled = isCancellation(content);
  const capacityRow = isCancellation(content)
    ? ''
    : `<p style="margin:0 0 24px; font-size:15px; color:#5a5a5a;">${escapeHtml(capacityLabel(content.confirmedCount, content.maxAttendees))}</p>`;
  const anyWaitlisted =
    !isCancellation(content) && content.attendees.some((a) => a.status === 'waitlisted');
  const lead = leadLine(content);
  const leadRow = lead
    ? `<p style="margin:0 0 16px; font-size:16px; color:${BRAND_GREEN}; font-weight:bold;">${escapeHtml(lead)}</p>`
    : '';

  const heroRow = content.imageURL
    ? `<tr>
              <td style="padding:0;">
                <img src="${escapeHtml(content.imageURL)}" alt="${title}" width="480" style="display:block; width:100%; max-width:480px; height:auto; border:0;" />
              </td>
            </tr>`
    : '';

  const attendeeRows = attendeeLines(content)
    .map(
      (line) =>
        `<tr><td style="padding:4px 0; font-size:15px; color:#2b2b2b;">${escapeHtml(line)}</td></tr>`,
    )
    .join('\n                  ');

  const waitlistNote = anyWaitlisted
    ? `<p style="margin:0 0 16px; font-size:14px; color:#5a5a5a;">Si se libera una plaza te avisaremos automáticamente por orden de lista.</p>`
    : '';

  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(registrationEmailSubject(content))}</title>
  </head>
  <body style="margin:0; padding:0; background-color:${PAGE_BG}; font-family:Helvetica, Arial, sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${PAGE_BG}; padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px; width:100%; background-color:#ffffff; border-radius:12px; overflow:hidden;">
            <tr>
              <td style="background-color:${BRAND_GREEN}; padding:24px; text-align:center;">
                <span style="color:#ffffff; font-size:24px; font-weight:bold; letter-spacing:0.5px;">Cultuvilla</span>
              </td>
            </tr>
            ${heroRow}
            <tr>
              <td style="padding:32px 24px; color:#2b2b2b; font-size:16px; line-height:24px;">
                ${leadRow}
                <h1 style="margin:0 0 8px; font-size:22px; line-height:28px; color:${BRAND_GREEN};">${title}</h1>
                <p style="margin:0 0 4px; font-size:15px;">${escapeHtml(content.dateLabel)}</p>
                <p style="margin:0 0 4px; font-size:15px; color:#5a5a5a;">${escapeHtml(content.locationName)}</p>
                <p style="margin:0 0 24px; font-size:15px; color:#5a5a5a;">${escapeHtml(content.villageName)}</p>

                <p style="margin:0 0 8px; font-size:14px; font-weight:bold; color:#5a5a5a; text-transform:uppercase; letter-spacing:0.5px;">${escapeHtml(cancelled ? CANCELLED_SEAT_HEADING : SEAT_HEADING)}</p>
                <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 16px;">
                  ${attendeeRows}
                </table>
                ${waitlistNote}
                ${capacityRow}

                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 8px;">
                  <tr>
                    <td align="center" style="border-radius:8px; background-color:${BRAND_GREEN};">
                      <a href="${url}" target="_blank" style="display:inline-block; padding:14px 28px; color:#ffffff; text-decoration:none; font-size:16px; font-weight:bold; border-radius:8px;">Ver el evento</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:0; font-size:13px; color:#5a5a5a; text-align:center;">${escapeHtml(cancelled ? RESIGNUP_HINT : CANCEL_HINT)}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 24px; background-color:${PAGE_BG}; text-align:center; font-size:12px; color:#8a8a8a;">
                ${escapeHtml(FOOTER_TEXT)}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function renderRegistrationEmailText(content: RegistrationEmailContent): string {
  const cancelled = isCancellation(content);
  const anyWaitlisted =
    !isCancellation(content) && content.attendees.some((a) => a.status === 'waitlisted');
  const lead = leadLine(content);
  return [
    'Cultuvilla',
    '',
    ...(lead ? [lead, ''] : []),
    content.eventTitle,
    content.dateLabel,
    content.locationName,
    content.villageName,
    '',
    `${cancelled ? CANCELLED_SEAT_HEADING : SEAT_HEADING}:`,
    ...attendeeLines(content).map((line) => `- ${line}`),
    ...(anyWaitlisted
      ? ['', 'Si se libera una plaza te avisaremos automáticamente por orden de lista.']
      : []),
    '',
    ...(isCancellation(content)
      ? []
      : [capacityLabel(content.confirmedCount, content.maxAttendees), '']),
    `Ver el evento: ${content.eventUrl}`,
    cancelled ? RESIGNUP_HINT : CANCEL_HINT,
    '',
    FOOTER_TEXT,
  ].join('\n');
}
