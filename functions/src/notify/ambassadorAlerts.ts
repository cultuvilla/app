import type { NotifyMessage } from '@cultuvilla/shared/models';

/**
 * The two ways someone asks to be a pueblo's Embajador, as Telegram messages
 * for the founders: an `organizerRequests` doc from the app (approved with
 * `respondToOrganizerRequest`), and an `ambassadorLeads` doc from the read
 * site's /embajadores form (the team calls them back). Short and in Spanish;
 * the title is the link.
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
  requesterName: string | null;
  municipalityName: string | null;
  province: string | null;
  motivation: string | null;
}

export function organizerRequestAlert(input: OrganizerRequestAlertInput): NotifyMessage {
  const motivation = input.motivation?.trim();
  return {
    severity: 'info',
    title: `Solicitud de Embajador: ${puebloLabel(input.municipalityName, input.province)}`,
    body: [`${input.requesterName ?? 'Alguien'} · desde la app`, motivation ? `«${motivation}»` : null]
      .filter((line): line is string => line !== null)
      .join('\n'),
    link: consoleDocUrl(input.projectId, `organizerRequests/${input.requestId}`),
    dedupeKey: `organizer-request:${input.requestId}`,
  };
}

export interface AmbassadorLeadAlertInput {
  projectId: string | undefined;
  leadId: string;
  name: string;
  phone: string;
  municipalityName: string;
  /** False when what they typed matched no municipality. */
  matched: boolean;
}

export function ambassadorLeadAlert(input: AmbassadorLeadAlertInput): NotifyMessage {
  return {
    severity: 'info',
    title: `Embajador desde la web: ${input.municipalityName}${input.matched ? '' : ' (sin identificar)'}`,
    body: `${input.name} · ${input.phone}`,
    link: consoleDocUrl(input.projectId, `ambassadorLeads/${input.leadId}`),
    dedupeKey: `ambassador-lead:${input.leadId}`,
  };
}
