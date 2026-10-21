import { describe, it, expect } from 'vitest';
import {
  groupMessageEmailSubject,
  groupMessageFromName,
  renderGroupMessageEmailHtml,
  renderGroupMessageEmailText,
  type GroupMessageEmailContent,
} from '../../src/email/groupMessageEmailTemplate';

const content = (over: Partial<GroupMessageEmailContent> = {}): GroupMessageEmailContent => ({
  title: 'Asamblea anual',
  body: 'Será el sábado a las 18:00.\n\nTraed <ideas> & ganas.',
  poll: null,
  orgName: 'Asociación La Anduela',
  signerName: 'Luis Pérez',
  signerTitle: 'secretario',
  appUrl: 'https://cultuvilla.es/grupos?grupo=org1',
  ...over,
});

describe('group message email', () => {
  it('comes from the group through Cultuvilla, with the subject and the group', () => {
    expect(groupMessageFromName(content())).toBe('Asociación La Anduela (vía Cultuvilla)');
    expect(groupMessageEmailSubject(content())).toBe('Asamblea anual · Asociación La Anduela');
  });

  it('carries every paragraph and the signature in the plain text', () => {
    const text = renderGroupMessageEmailText(content());
    expect(text).toContain('Será el sábado a las 18:00.\n\nTraed <ideas> & ganas.');
    expect(text).toContain('Luis Pérez\nSecretaría · Asociación La Anduela');
    expect(text).toContain('Míralo en la app: https://cultuvilla.es/grupos?grupo=org1');
  });

  it('escapes the body in the HTML and points the poll at the app', () => {
    const html = renderGroupMessageEmailHtml(
      content({ poll: { question: '¿Venís a la cena?', options: ['Sí', 'No'] } }),
    );
    expect(html).toContain('Traed &lt;ideas&gt; &amp; ganas.');
    expect(html).not.toContain('<ideas>');
    expect(html).toContain('¿Venís a la cena?');
    expect(html).toContain('Responder en la app');
    const text = renderGroupMessageEmailText(content({ poll: { question: '¿Venís?', options: ['Sí', 'No'] } }));
    expect(text).toContain('¿Venís?\n- Sí\n- No\nResponde en la app: https://cultuvilla.es/grupos?grupo=org1');
  });
});
