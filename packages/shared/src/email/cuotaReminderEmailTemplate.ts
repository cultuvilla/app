/**
 * The cuota reminder email, sent by the scheduled `sendCuotaReminders` job in
 * the treasurer's name — the signature is a person of the junta, not
 * Cultuvilla. Same constraints as the registration email: hand-written
 * table-based HTML with inline styles, and a plain-text twin that carries every
 * fact (the amount, the due day, how to pay, the concept).
 */
import type { CuotaReminderStage } from '../models/organization/CuotaDataModel';
import type { OrgAdminTitle } from '../models/organization/SocioDataModel';
import { escapeHtml } from './html';

const BRAND_GREEN = '#2f5233';
const PAGE_BG = '#f4f1ec';
const FOOTER_TEXT = 'Enviado con Cultuvilla en nombre de la junta. Cultuvilla no cobra ni guarda ningún pago.';

/** How a title reads under a signature. Display only, like the title itself. */
export const ORG_ADMIN_TITLE_SIGNATURE: Record<OrgAdminTitle, string> = {
  presidente: 'Presidencia',
  secretario: 'Secretaría',
  tesorero: 'Tesorería',
  vocal: 'Vocal',
  otro: 'Junta',
};

export interface CuotaReminderLine {
  /** The socio's name — the member themself or a persona a cargo. */
  name: string;
  /** Preformatted ("30,00 €"). */
  amountLabel: string;
  /** The suggested concept for this socio's transfer. */
  concept: string;
}

export interface CuotaReminderEmailContent {
  stage: CuotaReminderStage;
  orgName: string;
  /** "2026" or "Marzo 2026". */
  periodLabel: string;
  /** Preformatted in Madrid ("1 de marzo de 2026"). */
  dueLabel: string;
  lines: CuotaReminderLine[];
  /** Preformatted total of every line. */
  totalLabel: string;
  bizum: string | null;
  iban: string | null;
  payInstructions: string | null;
  /** Null when the group has no admin on its roster: then the junta signs. */
  signer: { name: string; title: OrgAdminTitle | null } | null;
  /** Absolute link that opens the app on the group. */
  appUrl: string;
}

export function cuotaReminderEmailSubject(content: CuotaReminderEmailContent): string {
  const what = `Cuota ${content.periodLabel} de ${content.orgName}`;
  return content.stage === 'before' ? `${what}: vence el ${content.dueLabel}` : `${what}: pendiente de pago`;
}

/** The "From" display name: the group, through Cultuvilla. */
export function cuotaReminderFromName(content: Pick<CuotaReminderEmailContent, 'orgName'>): string {
  return `${content.orgName} (vía Cultuvilla)`;
}

function leadLine(content: CuotaReminderEmailContent): string {
  const what = `la cuota ${content.periodLabel} de ${content.orgName}`;
  return content.stage === 'before'
    ? `Te recordamos que ${what} vence el ${content.dueLabel}.`
    : `${what.charAt(0).toUpperCase()}${what.slice(1)} venció el ${content.dueLabel} y todavía no nos consta el pago.`;
}

const PAID_HINT = 'Si ya la has pagado, no hagas caso de este mensaje: la anotaremos en cuanto la veamos.';

function howToPay(content: CuotaReminderEmailContent): string[] {
  const rows: string[] = [];
  if (content.bizum) rows.push(`Bizum: ${content.bizum}`);
  if (content.iban) rows.push(`Transferencia: ${content.iban}`);
  if (content.payInstructions) rows.push(content.payInstructions);
  return rows;
}

function signatureLines(content: CuotaReminderEmailContent): string[] {
  if (!content.signer) return [`La junta de ${content.orgName}`];
  const title = content.signer.title ? ORG_ADMIN_TITLE_SIGNATURE[content.signer.title] : null;
  return [content.signer.name, title ? `${title} · ${content.orgName}` : content.orgName];
}

export function renderCuotaReminderEmailText(content: CuotaReminderEmailContent): string {
  const pay = howToPay(content);
  return [
    'Hola:',
    '',
    leadLine(content),
    '',
    ...content.lines.map((l) => `- ${l.name}: ${l.amountLabel} (concepto: "${l.concept}")`),
    ...(content.lines.length > 1 ? [`Total: ${content.totalLabel}`] : []),
    '',
    ...(pay.length > 0 ? ['Cómo pagar:', ...pay.map((r) => `- ${r}`), ''] : []),
    PAID_HINT,
    '',
    `Míralo en la app: ${content.appUrl}`,
    '',
    ...signatureLines(content),
    '',
    FOOTER_TEXT,
  ].join('\n');
}

export function renderCuotaReminderEmailHtml(content: CuotaReminderEmailContent): string {
  const p = (text: string, style = '') =>
    `<p style="margin:0 0 12px; font-size:15px; line-height:22px; color:#2b2b2b;${style}">${escapeHtml(text)}</p>`;
  const lineRows = content.lines
    .map(
      (l) =>
        `<tr><td style="padding:6px 0; font-size:15px; color:#2b2b2b;"><strong>${escapeHtml(l.name)}</strong>: ${escapeHtml(l.amountLabel)}<br /><span style="font-size:13px; color:#5a5a5a;">Concepto: ${escapeHtml(l.concept)}</span></td></tr>`,
    )
    .join('\n                  ');
  const total = content.lines.length > 1 ? p(`Total: ${content.totalLabel}`, ' font-weight:bold;') : '';
  const pay = howToPay(content);
  const payBlock =
    pay.length > 0
      ? `<p style="margin:16px 0 8px; font-size:14px; font-weight:bold; color:#5a5a5a; text-transform:uppercase; letter-spacing:0.5px;">Cómo pagar</p>
                ${pay.map((r) => p(r)).join('\n                ')}`
      : '';
  const signature = signatureLines(content)
    .map((line, i) => `<p style="margin:0; font-size:15px; color:${i === 0 ? '#2b2b2b' : '#5a5a5a'};${i === 0 ? ' font-weight:bold;' : ''}">${escapeHtml(line)}</p>`)
    .join('\n                ');

  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(cuotaReminderEmailSubject(content))}</title>
  </head>
  <body style="margin:0; padding:0; background-color:${PAGE_BG}; font-family:Helvetica, Arial, sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${PAGE_BG}; padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px; width:100%; background-color:#ffffff; border-radius:12px; overflow:hidden;">
            <tr>
              <td style="background-color:${BRAND_GREEN}; padding:20px 24px; text-align:center;">
                <span style="color:#ffffff; font-size:20px; font-weight:bold;">${escapeHtml(content.orgName)}</span>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 24px;">
                ${p('Hola:')}
                ${p(leadLine(content))}
                <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 12px;">
                  ${lineRows}
                </table>
                ${total}
                ${payBlock}
                ${p(PAID_HINT, ' color:#5a5a5a; font-size:14px;')}
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px auto 24px;">
                  <tr>
                    <td align="center" style="border-radius:8px; background-color:${BRAND_GREEN};">
                      <a href="${escapeHtml(content.appUrl)}" target="_blank" style="display:inline-block; padding:12px 24px; color:#ffffff; text-decoration:none; font-size:15px; font-weight:bold; border-radius:8px;">Ver mi cuota</a>
                    </td>
                  </tr>
                </table>
                ${signature}
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
