/**
 * A message from a group's junta, sent by the `sendGroupMessage` callable in
 * the sending admin's name — the signature is a person of the junta, not
 * Cultuvilla. Same constraints as the cuota reminder: hand-written table-based
 * HTML with inline styles, and a plain-text twin carrying every fact.
 */
import {
  groupMessageSignatureLines,
  type GroupMessageSignature,
  type GroupPoll,
} from '../models/organization/GroupMessageDataModel';
import { escapeHtml } from './html';

const BRAND_GREEN = '#2f5233';
const PAGE_BG = '#f4f1ec';
const FOOTER_TEXT = 'Enviado con Cultuvilla en nombre de la junta del grupo.';

export interface GroupMessageEmailContent extends GroupMessageSignature {
  title: string;
  body: string;
  poll: Pick<GroupPoll, 'question' | 'options'> | null;
  /** Absolute link that opens the app on the group. */
  appUrl: string;
}

export function groupMessageEmailSubject(content: Pick<GroupMessageEmailContent, 'title' | 'orgName'>): string {
  const title = content.title.trim();
  return title ? `${title} · ${content.orgName}` : content.orgName;
}

/** The "From" display name: the group. The address already says Cultuvilla. */
export function groupMessageFromName(content: Pick<GroupMessageEmailContent, 'orgName'>): string {
  return content.orgName;
}

function paragraphs(body: string): string[] {
  return body
    .trim()
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

export function renderGroupMessageEmailText(content: GroupMessageEmailContent): string {
  return [
    content.title.trim(),
    '',
    ...paragraphs(content.body).flatMap((p) => [p, '']),
    ...(content.poll
      ? [content.poll.question, ...content.poll.options.map((o) => `- ${o}`), `Responde en la app: ${content.appUrl}`, '']
      : [`Míralo en la app: ${content.appUrl}`, '']),
    ...groupMessageSignatureLines(content),
    '',
    FOOTER_TEXT,
  ].join('\n');
}

export function renderGroupMessageEmailHtml(content: GroupMessageEmailContent): string {
  // Line breaks inside a paragraph are the writer's: keep them.
  const p = (text: string, style = '') =>
    `<p style="margin:0 0 12px; font-size:15px; line-height:22px; color:#2b2b2b;${style}">${escapeHtml(text).replace(/\n/g, '<br />')}</p>`;
  const body = paragraphs(content.body).map((text) => p(text)).join('\n                ');
  const poll = content.poll
    ? `<p style="margin:16px 0 8px; font-size:15px; font-weight:bold; color:#2b2b2b;">${escapeHtml(content.poll.question)}</p>
                ${content.poll.options.map((o) => p(`· ${o}`, ' margin-bottom:4px;')).join('\n                ')}`
    : '';
  const button = content.poll ? 'Responder en la app' : 'Abrir en la app';
  const signature = groupMessageSignatureLines(content)
    .map((line, i) => `<p style="margin:0; font-size:15px; color:${i === 0 ? '#2b2b2b' : '#5a5a5a'};${i === 0 ? ' font-weight:bold;' : ''}">${escapeHtml(line)}</p>`)
    .join('\n                ');

  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(groupMessageEmailSubject(content))}</title>
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
                ${p(content.title.trim(), ' font-size:18px; font-weight:bold;')}
                ${body}
                ${poll}
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px auto 24px;">
                  <tr>
                    <td align="center" style="border-radius:8px; background-color:${BRAND_GREEN};">
                      <a href="${escapeHtml(content.appUrl)}" target="_blank" style="display:inline-block; padding:12px 24px; color:#ffffff; text-decoration:none; font-size:15px; font-weight:bold; border-radius:8px;">${button}</a>
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
