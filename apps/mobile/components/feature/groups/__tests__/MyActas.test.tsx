import { fireEvent, render, within } from '@testing-library/react-native';
import { buildActaData, type ActaInput } from '@cultuvilla/shared/models/organization';
import { resetWatchers, setWatched } from '../../../../test/watchers';
import { MyActas } from '../MyActas';
import { agreementTimeline } from '../agreementTimeline';

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../../../../lib/i18n', () => ({
  useT: () => ({
    locale: 'es',
    t: (k: string, v?: Record<string, unknown>) => (v ? `${k}:${Object.values(v).map(String).join('|')}` : k),
  }),
}));
jest.mock('@cultuvilla/shared/services/recordsService', () => ({
  watchSocioVisibleActas: jest.requireActual<typeof import('../../../../test/watchers')>('../../../../test/watchers').mockWatcher('visibleActas'),
}));

function acta(id: string, input: Partial<ActaInput>) {
  return {
    id,
    ...buildActaData({
      body: 'asamblea_general',
      heldOn: '2025-11-22',
      attendees: [],
      agenda: [],
      agreements: [],
      createdBy: 'u-admin',
      ...input,
    }),
    visibleToSocios: true,
  };
}

const ASAMBLEA = acta('a25', { agreements: ['La cuota sube a 25 € desde 2026', 'El magosto se hace en la plaza'] });
const JUNTA = acta('j25', { body: 'junta_directiva', heldOn: '2025-10-03', agreements: ['Se compra una carpa'] });
const LOCAL = acta('x24', { body: 'otro', title: 'Extraordinaria: local', heldOn: '2024-06-02' });

beforeEach(() => resetWatchers());

describe('agreementTimeline', () => {
  it('groups agreements by year, newest acta first, and keeps an acta without agreements as one entry', () => {
    const years = agreementTimeline([LOCAL, JUNTA, ASAMBLEA]);
    expect(years.map((y) => y.year)).toEqual(['2025', '2024']);
    expect(years[0]?.items.map((i) => i.text)).toEqual(['La cuota sube a 25 € desde 2026', 'El magosto se hace en la plaza', 'Se compra una carpa']);
    expect(years[0]?.items[2]).toMatchObject({ actaId: 'j25', source: 'Junta directiva', isAsamblea: false });
    expect(years[1]?.items).toEqual([expect.objectContaining({ actaId: 'x24', text: 'Extraordinaria: local', source: null })]);
  });

  it('searches agreements and acta headings, ignoring case and accents', () => {
    expect(agreementTimeline([ASAMBLEA, JUNTA], 'CUOTA').flatMap((y) => y.items.map((i) => i.text))).toEqual(['La cuota sube a 25 € desde 2026']);
    expect(agreementTimeline([ASAMBLEA, JUNTA], 'junta').flatMap((y) => y.items.map((i) => i.actaId))).toEqual(['j25']);
    expect(agreementTimeline([LOCAL], 'extraordinaria')).toHaveLength(1);
    expect(agreementTimeline([ASAMBLEA], 'piscina')).toEqual([]);
  });
});

describe('MyActas', () => {
  it('shows the agreements by year and opens the acta an agreement belongs to, read-only', () => {
    setWatched('visibleActas', [ASAMBLEA, JUNTA, LOCAL]);
    const { getByTestId, queryByTestId } = render(<MyActas orgId="org1" orgName="La Anduela" />);

    expect(within(getByTestId('my-actas-year-2025')).getByText('Se compra una carpa')).toBeTruthy();
    expect(within(getByTestId('my-actas-year-2024')).getByText('Extraordinaria: local')).toBeTruthy();

    fireEvent.press(getByTestId('agreement-j25-0'));
    expect(within(getByTestId('acta-detail')).getByText('1. Se compra una carpa')).toBeTruthy();
    expect(getByTestId('acta-detail-scroll')).toBeTruthy();
    expect(getByTestId('acta-share')).toBeTruthy();
    expect(queryByTestId('acta-edit')).toBeNull();
  });

  it('filters by the search box, says when nothing matches, and clears', () => {
    setWatched('visibleActas', [ASAMBLEA, JUNTA]);
    const { getByTestId, queryByTestId, queryByText } = render(<MyActas orgId="org1" orgName="La Anduela" />);

    fireEvent.changeText(getByTestId('my-actas-search'), 'magosto');
    expect(queryByText('El magosto se hace en la plaza')).toBeTruthy();
    expect(queryByText('Se compra una carpa')).toBeNull();

    fireEvent.changeText(getByTestId('my-actas-search'), 'piscina');
    expect(getByTestId('my-actas-no-results')).toBeTruthy();

    fireEvent.press(getByTestId('my-actas-search-clear'));
    expect(queryByTestId('my-actas-no-results')).toBeNull();
    expect(queryByText('Se compra una carpa')).toBeTruthy();
  });

  it('renders the empty state, or nothing, while there are no shared actas', () => {
    setWatched('visibleActas', []);
    expect(render(<MyActas orgId="org1" orgName="La Anduela" />).queryByTestId('my-actas')).toBeNull();
    const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
    expect(render(<MyActas orgId="org1" orgName="La Anduela" empty={<Text>vacío</Text>} />).getByText('vacío')).toBeTruthy();
  });
});
