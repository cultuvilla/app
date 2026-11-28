import { router } from 'expo-router';
import { mentionIsNavigable, openMention } from '../newsMentions';
import { getMunicipality } from '@cultuvilla/shared/services/municipalityService';
import type { NewsMention } from '@cultuvilla/shared/models/news/NewsPostDataModel';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@cultuvilla/shared/services/municipalityService', () => {
  const { fakeService } = jest.requireActual<typeof import('../../test/fakeModule')>('../../test/fakeModule');
  return fakeService<typeof import('@cultuvilla/shared/services/municipalityService')>(
    '@cultuvilla/shared/services/municipalityService',
  );
});

const push = router.push as jest.Mock;
const getMuni = getMunicipality as jest.Mock;

const mention = (entityType: NewsMention['entityType'], entityId: string, label: string): NewsMention => ({
  entityType,
  entityId,
  label,
  offset: 0,
  length: label.length,
});

describe('openMention', () => {
  beforeEach(() => {
    push.mockClear();
    getMuni.mockReset();
  });

  it.each([
    ['organization', 'o1', 'Peña El Roble', '/matabuena/entidad/pena-el-roble_o1'],
    ['event', 'e1', 'Fiestas', '/matabuena/evento/fiestas_e1'],
    ['place', 'p1', 'La Ermita', '/matabuena/lugar/la-ermita_p1'],
    ['barrio', 'b1', 'El Arrabal', '/matabuena/barrio/el-arrabal_b1'],
    ['news', 'n1', 'Bando', '/matabuena/noticia/bando_n1'],
  ] as const)('opens a %s mention in its pueblo', async (kind, id, label, expected) => {
    await openMention(mention(kind, id, label), 'matabuena');
    expect(push).toHaveBeenCalledWith(expected);
  });

  // A mention of another village is the one case the label cannot answer: two
  // pueblos can share a name, so the slug has to come from the doc.
  it('resolves a village mention to its own slug', async () => {
    getMuni.mockResolvedValue({ id: 'm2', slug: 'moya-cuenca' });
    await openMention(mention('village', 'm2', 'Moya'), 'matabuena');
    expect(push).toHaveBeenCalledWith('/moya-cuenca');
  });

  it('goes nowhere when the mentioned village is gone', async () => {
    getMuni.mockResolvedValue(null);
    await openMention(mention('village', 'gone', 'Moya'), 'matabuena');
    expect(push).not.toHaveBeenCalled();
  });

  it('marks every mention type as navigable', () => {
    expect(mentionIsNavigable(mention('event', 'e1', 'x'))).toBe(true);
  });
});
