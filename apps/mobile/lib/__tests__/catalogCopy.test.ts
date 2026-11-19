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

describe('delete-account blockers', () => {
  // Group names often already start with the kind («Grupo QA Buzón», «Peña El
  // Rollo»), so prefixing it read «Grupo de Grupo QA Buzón».
  it('shows a group by its own name, without prefixing the kind', () => {
    const line = t('settings.deleteAccount.blockerOrg', { name: 'Grupo QA Buzon' });
    expect(line).toContain('Grupo QA Buzon');
    expect(line).not.toMatch(/Grupo de Grupo/);
  });
});
