import { getMessages } from '@cultuvilla/i18n';
import { createI18n } from '../i18n';

// Count strings shown on village-home cards (and their accessibility labels):
// a QA pass found «1 personas» on a one-member group.
const { t } = createI18n({ es: getMessages('es') as Record<string, unknown> }, 'es');

describe('count copy agrees in number', () => {
  it.each([
    ['village.hub.memberCount', '1 persona', '3 personas'],
    ['village.admin.barrios.residentCount', '1 vecino', '3 vecinos'],
    ['village.vocabulary.inVillages', 'en 1 pueblo', 'en 3 pueblos'],
    ['village.vocabulary.definitionCount', '1 significado', '3 significados'],
  ])('%s', (key, one, other) => {
    expect(t(key, { count: 1 })).toBe(one);
    expect(t(key, { count: 3 })).toBe(other);
  });

  it('village.vocabulary.joiningWord', () => {
    expect(t('village.vocabulary.joiningWord', { count: 1 })).toContain('recogida en 1 pueblo.');
    expect(t('village.vocabulary.joiningWord', { count: 3 })).toContain('recogida en 3 pueblos.');
  });
});

// The rest of the «1 …» family (QA 2026-11-20): each message read in the plural
// for a single item.
describe('more count copy agrees in number', () => {
  it.each([
    ['village.wrapped.prompt.body', { events: 1 }, '1 evento con', { events: 3 }, '3 eventos con'],
    ['event.export.body', { count: 1 }, '(1 persona)', { count: 3 }, '(3 personas)'],
    ['groups.sections.withCount', { label: 'Avisos', count: 1 }, 'Avisos, 1 pendiente', { label: 'Avisos', count: 3 }, 'Avisos, 3 pendientes'],
    ['groups.transparency.cuota.summary', { alDia: 2, pendiente: 1 }, '2 al día · 1 pendiente', { alDia: 2, pendiente: 3 }, '2 al día · 3 pendientes'],
    ['groups.transparency.avisos.votes', { count: 1 }, '1 voto', { count: 3 }, '3 votos'],
    ['groups.cuota.admin.ofPaid', { count: 1 }, 'de 1 pagada', { count: 3 }, 'de 3 pagadas'],
    ['groups.tasks.shift.slots', { claimed: 0, slots: 1 }, '0 de 1 plaza', { claimed: 1, slots: 3 }, '1 de 3 plazas'],
    ['groups.tasks.form.slotsBelowClaimed', { count: 1 }, 'Ya hay 1 apuntado:', { count: 3 }, 'Ya hay 3 apuntados:'],
    ['groups.tasks.checklists.progress', { done: 0, total: 1 }, '0 de 1 hecha', { done: 1, total: 3 }, '1 de 3 hechas'],
    ['groups.messages.whatsappCount', { sent: 1, total: 1 }, '1 de 1 enviado', { sent: 1, total: 3 }, '1 de 3 enviados'],
    ['village.vocabulary.seeAll', { count: 1 }, 'Ver la palabra', { count: 3 }, 'Ver las 3'],
    ['groups.tasks.filter.allWithCount', { count: 1 }, '(1 activo)', { count: 3 }, '(3 activos)'],
  ] as const)('%s', (key, oneVars, one, otherVars, other) => {
    const single = t(key, oneVars);
    expect(single).toContain(one);
    expect(t(key, otherVars)).toContain(other);
    expect(single).not.toMatch(/[{}]/);
  });
});

describe('delete-account blockers', () => {
  // Group names often already start with the kind («Grupo QA Buzón», «Peña El
  // Rollo»), so prefixing it read «Grupo de Grupo QA Buzón».
  it('shows a group by its own name, without prefixing the kind', () => {
    const line = t('settings.deleteAccount.blockerOrg', { name: 'Grupo QA Buzon' });
    expect(line).toContain('Grupo QA Buzon');
    expect(line).not.toMatch(/Grupo de Grupo/);
  });
});
