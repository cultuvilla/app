import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { madridYear } from '@cultuvilla/shared/models';
import { WrappedPrompt } from '../WrappedPrompt';
import { getVillageWrappedForYear } from '@cultuvilla/shared/services/villageWrappedService';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('../../../../lib/i18n', () => ({ useT: () => ({ locale: 'es', t: (k: string) => k }) }));
jest.mock('@cultuvilla/shared/services/villageWrappedService', () => ({ getVillageWrappedForYear: jest.fn() }));

const mockForYear = getVillageWrappedForYear as jest.Mock;
const DAY = 24 * 60 * 60 * 1000;

function recentEvent(daysAgo: number) {
  return {
    startDate: new Date(Date.now() - daysAgo * DAY),
    status: 'completed' as const,
    visibility: 'public' as const,
    confirmedCount: 8,
    commentCount: 2,
  };
}

const LIVELY = [recentEvent(3), recentEvent(4)];
const YEAR = madridYear(new Date(Date.now() - 3 * DAY));

beforeEach(() => jest.clearAllMocks());

describe('WrappedPrompt', () => {
  it('invites the admin to make the resumen after a lively stretch', async () => {
    mockForYear.mockResolvedValue(null);
    const { findByTestId } = render(<WrappedPrompt municipalityId="m1" villageSlug="villa" events={LIVELY} fiestas={[]} />);
    fireEvent.press(await findByTestId('wrapped-prompt-action'));
    expect(mockForYear).toHaveBeenCalledWith('m1', YEAR);
    expect(router.push).toHaveBeenCalledWith(`/villa/resumen?year=${String(YEAR)}`);
  });

  it('points a waiting draft out for review', async () => {
    mockForYear.mockResolvedValue({ status: 'draft' });
    const { findByText } = render(<WrappedPrompt municipalityId="m1" villageSlug="villa" events={LIVELY} fiestas={[]} />);
    expect(await findByText('village.wrapped.prompt.review')).toBeTruthy();
  });

  it.each(['published', 'discarded'])('goes away once the year is %s', async (status) => {
    mockForYear.mockResolvedValue({ status });
    const { queryByTestId } = render(<WrappedPrompt municipalityId="m1" villageSlug="villa" events={LIVELY} fiestas={[]} />);
    await waitFor(() => expect(mockForYear).toHaveBeenCalled());
    expect(queryByTestId('wrapped-prompt')).toBeNull();
  });

  it('stays quiet without movement, and reads nothing', () => {
    const { queryByTestId } = render(
      <WrappedPrompt municipalityId="m1" villageSlug="villa" events={[recentEvent(3)]} fiestas={[]} />,
    );
    expect(queryByTestId('wrapped-prompt')).toBeNull();
    expect(mockForYear).not.toHaveBeenCalled();
  });
});
