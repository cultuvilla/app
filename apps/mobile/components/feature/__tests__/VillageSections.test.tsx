import { render } from '@testing-library/react-native';
import { EntityCard } from '../VillageSections';

// Real Spanish catalog, so the spoken labels are asserted as VoiceOver reads them.
jest.mock('../../../lib/i18n', () => {
  const { getMessages } = jest.requireActual('@cultuvilla/i18n');
  const es = getMessages('es');
  const resolve = (k: string): unknown =>
    k.split('.').reduce<unknown>((o, seg) => (o == null ? undefined : (o as Record<string, unknown>)[seg]), es);
  return {
    useT: () => ({
      locale: 'es',
      t: (k: string, vars?: Record<string, string | number>) => {
        const tpl = resolve(k);
        if (typeof tpl !== 'string') return k;
        return vars ? tpl.replace(/\{(\w+)\}/g, (_: string, kk: string) => String(vars[kk] ?? `{${kk}}`)) : tpl;
      },
    }),
  };
});

describe('<EntityCard>', () => {
  it('renders the comment count badge when commentCount > 0', () => {
    const { getByTestId, getByText } = render(
      <EntityCard label="La Fiesta" icon="calendar-outline" commentCount={5} />,
    );
    expect(getByTestId('entity-card-comment-count')).toBeTruthy();
    expect(getByText('5')).toBeTruthy();
  });

  it('renders an alternate stat badge instead of the comment badge', () => {
    const { getByTestId, getByText, queryByTestId } = render(
      <EntityCard
        label="Cementerio"
        icon="location-outline"
        commentCount={5}
        statBadge={{ icon: 'person-outline', count: 7, spoken: 'burials', testID: 'entity-card-burial-count' }}
      />,
    );
    expect(getByTestId('entity-card-burial-count')).toBeTruthy();
    expect(getByText('7')).toBeTruthy();
    expect(queryByTestId('entity-card-comment-count')).toBeNull();
  });

  it('renders no comment count badge when commentCount is 0', () => {
    const { queryByTestId } = render(
      <EntityCard label="La Fiesta" icon="calendar-outline" commentCount={0} />,
    );
    expect(queryByTestId('entity-card-comment-count')).toBeNull();
  });

  it('renders no comment count badge when commentCount is undefined', () => {
    const { queryByTestId } = render(<EntityCard label="La Fiesta" icon="calendar-outline" />);
    expect(queryByTestId('entity-card-comment-count')).toBeNull();
  });

  it('never renders the comment count badge on a crest card (villages are not commentable)', () => {
    const { queryByTestId } = render(
      <EntityCard label="Villalba" icon="home-outline" commentCount={5} crest />,
    );
    expect(queryByTestId('entity-card-comment-count')).toBeNull();
  });

  // A card is one accessibility element, so VoiceOver hears only its label:
  // the count badge and the second line have to be spoken in it.
  describe('accessibility label', () => {
    it('speaks the name, the second line and the count', () => {
      const { getByLabelText } = render(
        <EntityCard
          label="Cementerio"
          sub="Junto a la ermita"
          icon="location-outline"
          statBadge={{ icon: 'person-outline', count: 2, spoken: 'burials' }}
          onPress={jest.fn()}
        />,
      );
      expect(getByLabelText('Cementerio, Junto a la ermita, 2 personas enterradas')).toBeTruthy();
    });

    it('uses the singular for one, and speaks comments by default', () => {
      const one = render(
        <EntityCard label="Fiesta" icon="calendar-outline" statBadge={{ icon: 'person-outline', count: 1, spoken: 'attendees' }} onPress={jest.fn()} />,
      );
      expect(one.getByLabelText('Fiesta, 1 persona apuntada')).toBeTruthy();
      const comments = render(<EntityCard label="Plaza" icon="location-outline" commentCount={3} onPress={jest.fn()} />);
      expect(comments.getByLabelText('Plaza, 3 comentarios')).toBeTruthy();
    });

    it('is the bare name when there is nothing to count', () => {
      const { getByLabelText } = render(<EntityCard label="Plaza" icon="location-outline" onPress={jest.fn()} />);
      expect(getByLabelText('Plaza')).toBeTruthy();
    });
  });
});
