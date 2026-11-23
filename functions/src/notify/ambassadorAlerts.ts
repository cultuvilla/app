import type { NotifyMessage } from '@cultuvilla/shared/models';
import { ADMIN_ORGANIZER_REQUESTS_PATH, webOriginForProject } from '@cultuvilla/shared/utils';

/**
 * The two ways someone asks to be a pueblo's Embajador, as Telegram messages
 * for the founders: an `organizerRequests` doc from the app (approved with
 * `respondToOrganizerRequest`), and an `ambassadorLeads` doc from the read
 * site's /embajadores form (the team calls them back).
 *
 * No personal data leaves for Telegram (decided 2026-11-20, Álvaro): a message
 * says what happened and in which pueblo, and links to where a founder signed
 * in can read who asked — never a name, phone, email or the free-text
 * motivation. That is why these builders take no such input at all.
 */

const consoleDocUrl = (projectId: string | undefined, path: string): string | undefined =>
  projectId
    ? `https://console.firebase.google.com/project/${projectId}/firestore/databases/-default-/data/~2F${path
        .split('/')
        .map(encodeURIComponent)
        .join('~2F')}`
    : undefined;

const puebloLabel = (name: string | null, province: string | null): string =>
  name ? (province ? `${name} (${province})` : name) : 'pueblo desconocido';

export interface OrganizerRequestAlertInput {
  projectId: string | undefined;
  requestId: string;
  municipalityName: string | null;
  province: string | null;
}

/** Links the app's admin queue, which opens in the app (universal link) and shows the requester there. */
export function organizerRequestAlert(input: OrganizerRequestAlertInput): NotifyMessage {
  return {
    severity: 'info',
    title: 'Nueva solicitud de Embajador',
    body: puebloLabel(input.municipalityName, input.province),
    link: `${webOriginForProject(input.projectId)}${ADMIN_ORGANIZER_REQUESTS_PATH}`,
    dedupeKey: `organizer-request:${input.requestId}`,
  };
}

export interface AmbassadorLeadAlertInput {
  projectId: string | undefined;
  leadId: string;
  municipalityName: string;
  /** False when what they typed matched no municipality. */
  matched: boolean;
}

/** No app screen lists `ambassadorLeads/`, so the link is the lead's Firebase console document. */
export function ambassadorLeadAlert(input: AmbassadorLeadAlertInput): NotifyMessage {
  return {
    severity: 'info',
    title: 'Nuevo contacto desde /embajadores',
    body: `${input.municipalityName}${input.matched ? '' : ' (sin identificar)'}`,
    link: consoleDocUrl(input.projectId, `ambassadorLeads/${input.leadId}`),
    dedupeKey: `ambassador-lead:${input.leadId}`,
  };
}
