import { describe, it, expect } from 'vitest';
import {
  cuotaReminderEmailSubject,
  cuotaReminderFromName,
  renderCuotaReminderEmailHtml,
  renderCuotaReminderEmailText,
  type CuotaReminderEmailContent,
} from '../../src/email/cuotaReminderEmailTemplate';

const content = (over: Partial<CuotaReminderEmailContent> = {}): CuotaReminderEmailContent => ({
  stage: 'before',
  orgName: 'Asociación La Anduela',
  periodLabel: '2026',
  dueLabel: '1 de marzo de 2026',
  lines: [{ name: 'Ana García', amountLabel: '30,00 €', concept: 'Cuota 2026 — Ana García' }],
  totalLabel: '30,00 €',
  bizum: '600111222',
  iban: 'ES12 3456',
  payInstructions: null,
  signer: { name: 'Luis Pérez', title: 'tesorero' },
  appUrl: 'https://cultuvilla.es/grupos',
  ...over,
});

describe('cuota reminder email', () => {
  it('says what is due, when, and how to pay, signed by the treasurer', () => {
    const text = renderCuotaReminderEmailText(content());
    expect(text).toContain('Te recordamos que la cuota 2026 de Asociación La Anduela vence el 1 de marzo de 2026.');
    expect(text).toContain('- Ana García: 30,00 € (concepto: "Cuota 2026 — Ana García")');
    expect(text).toContain('Bizum: 600111222');
    expect(text).toContain('Transferencia: ES12 3456');
    expect(text).toContain('Luis Pérez\nTesorería · Asociación La Anduela');
    expect(text).not.toContain('Total:');
  });

  it('after the due date it says the payment is missing, and totals a household', () => {
    const c = content({
      stage: 'after',
      lines: [
        { name: 'Ana', amountLabel: '30,00 €', concept: 'Cuota 2026 — Ana' },
        { name: 'Lucía', amountLabel: '30,00 €', concept: 'Cuota 2026 — Lucía' },
      ],
      totalLabel: '60,00 €',
    });
    expect(cuotaReminderEmailSubject(c)).toBe('Cuota 2026 de Asociación La Anduela: pendiente de pago');
    const text = renderCuotaReminderEmailText(c);
    expect(text).toContain('La cuota 2026 de Asociación La Anduela venció el 1 de marzo de 2026');
    expect(text).toContain('Total: 60,00 €');
  });

  it('the junta signs when no admin can', () => {
    expect(renderCuotaReminderEmailText(content({ signer: null }))).toContain('La junta de Asociación La Anduela');
  });

  it('escapes the html and names the group as sender', () => {
    const html = renderCuotaReminderEmailHtml(content({ orgName: 'Peña <Los> & Co' }));
    expect(html).toContain('Peña &lt;Los&gt; &amp; Co');
    expect(html).not.toContain('<Los>');
    expect(cuotaReminderFromName({ orgName: 'Peña X' })).toBe('Peña X (vía Cultuvilla)');
    expect(cuotaReminderEmailSubject(content())).toBe('Cuota 2026 de Asociación La Anduela: vence el 1 de marzo de 2026');
  });
});
