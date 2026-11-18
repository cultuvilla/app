import { getMessages } from '@cultuvilla/i18n';
import { createI18n } from '../i18n';

// Count strings shown on village-home cards (and their accessibility labels):
// a QA pass found «1 personas» on a one-member group.
const { t } = createI18n({ es: getMessages('es') as Record<string, unknown> }, 'es');

describe('count copy agrees in number', () => {
  it.each([
    ['village.hub.memberCount', '1 persona', '3 personas'],
    ['village.admin.barrios.residentCount', '1 vecino', '3 vecinos'],
  ])('%s', (key, one, other) => {
    expect(t(key, { count: 1 })).toBe(one);
    expect(t(key, { count: 3 })).toBe(other);
  });
});
