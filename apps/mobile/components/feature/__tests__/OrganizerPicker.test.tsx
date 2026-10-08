import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { OrganizerPicker } from '../OrganizerPicker';

// --- service mocks -----------------------------------------------------------
jest.mock('@cultuvilla/shared/services/villageMemberService', () => ({
  getVillageMembers: jest.fn(),
}));
jest.mock('@cultuvilla/shared/services/userService', () => ({
  getPublicProfile: jest.fn(),
}));
jest.mock('@cultuvilla/shared/services/municipalityPersonService', () => ({
  getMunicipalityPeople: jest.fn(),
}));
jest.mock('@cultuvilla/shared/services/organizationService', () => ({
  getOrganizationsByMunicipality: jest.fn(),
}));

import { getVillageMembers } from '@cultuvilla/shared/services/villageMemberService';
import { getPublicProfile } from '@cultuvilla/shared/services/userService';
import { getMunicipalityPeople } from '@cultuvilla/shared/services/municipalityPersonService';
import { getOrganizationsByMunicipality } from '@cultuvilla/shared/services/organizationService';

const mockGetVillageMembers = getVillageMembers as jest.Mock;
const mockGetPublicProfile = getPublicProfile as jest.Mock;
const mockGetMunicipalityPeople = getMunicipalityPeople as jest.Mock;
const mockGetOrganizationsByMunicipality = getOrganizationsByMunicipality as jest.Mock;

// --- LiveOwnerChip mock — renders testID so we can find locked creator --------
jest.mock('../LiveOwnerChip', () => ({
  LiveOwnerChip: ({ ownerId, ownerType }: { ownerId: string; ownerType: string }) => {
    const { Text } = require('react-native');
    return <Text testID={`chip-${ownerType}-${ownerId}`}>{ownerId}</Text>;
  },
}));

// --- i18n mock ----------------------------------------------------------------
jest.mock('../../../lib/i18n', () => ({ useT: () => ({ locale: 'es', t: (k: string) => k }) }));

// --- safe-area ----------------------------------------------------------------
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// ---------------------------------------------------------------------------

const MUNICIPALITY_ID = 'mun1';
const CREATOR_ID = 'creator1';
const OTHER_USER_ID = 'user2';
const ORG_ID = 'org1';

function defaultMocks() {
  mockGetVillageMembers.mockResolvedValue([
    { id: OTHER_USER_ID, userId: OTHER_USER_ID, role: 'user', joinedAt: new Date() },
    { id: CREATOR_ID, userId: CREATOR_ID, role: 'user', joinedAt: new Date() },
  ]);
  mockGetMunicipalityPeople.mockResolvedValue([
    {
      id: `${MUNICIPALITY_ID}_p1`,
      userId: CREATOR_ID,
      displayName: 'Creator Name',
      sortName: 'creator name',
      photoURL: null,
    },
    {
      id: `${MUNICIPALITY_ID}_p2`,
      userId: OTHER_USER_ID,
      displayName: 'Other User',
      sortName: 'other user',
      photoURL: null,
    },
  ]);
  mockGetPublicProfile.mockImplementation(async (uid: string) => ({
    displayName: `Fallback ${uid}`,
    photoURL: null,
  }));
  mockGetOrganizationsByMunicipality.mockResolvedValue([
    { id: ORG_ID, name: 'Org One', municipalityId: MUNICIPALITY_ID, status: 'approved', images: [] },
  ]);
}

beforeEach(() => {
  jest.clearAllMocks();
  defaultMocks();
});

describe('<OrganizerPicker>', () => {
  it('renders the locked creator chip immediately', async () => {
    const { getByTestId } = render(
      <OrganizerPicker
        municipalityId={MUNICIPALITY_ID}
        selectedUserIds={[CREATOR_ID]}
        selectedOrgIds={[]}
        lockedUserId={CREATOR_ID}
        onChangeUsers={jest.fn()}
        onChangeOrgs={jest.fn()}
      />,
    );
    // The locked creator chip is rendered regardless of async loading
    expect(getByTestId(`chip-user-${CREATOR_ID}`)).toBeTruthy();
  });

  it('calls onChangeOrgs when picking a group via the "Añadir grupo" sheet', async () => {
    const onChangeOrgs = jest.fn();
    const { getByTestId } = render(
      <OrganizerPicker
        municipalityId={MUNICIPALITY_ID}
        selectedUserIds={[CREATOR_ID]}
        selectedOrgIds={[]}
        lockedUserId={CREATOR_ID}
        onChangeUsers={jest.fn()}
        onChangeOrgs={onChangeOrgs}
      />,
    );
    // Open the group picker sheet
    await waitFor(() => {
      expect(getByTestId('add-org-btn')).toBeTruthy();
    });
    fireEvent.press(getByTestId('add-org-btn'));
    // Wait for the sheet to show the org row, select it, then confirm
    await waitFor(() => {
      expect(getByTestId(`org-row-${ORG_ID}`)).toBeTruthy();
    });
    fireEvent.press(getByTestId(`org-row-${ORG_ID}`));
    fireEvent.press(getByTestId('org-confirm'));
    expect(onChangeOrgs).toHaveBeenCalledWith([ORG_ID]);
  });

  it('opens the villager sheet when add-user button is pressed and calls onChangeUsers on confirm', async () => {
    const onChangeUsers = jest.fn();
    const { getByTestId, queryByTestId } = render(
      <OrganizerPicker
        municipalityId={MUNICIPALITY_ID}
        selectedUserIds={[CREATOR_ID]}
        selectedOrgIds={[]}
        lockedUserId={CREATOR_ID}
        onChangeUsers={onChangeUsers}
        onChangeOrgs={jest.fn()}
      />,
    );
    // Open the villager picker sheet
    await waitFor(() => {
      expect(getByTestId('add-user-btn')).toBeTruthy();
    });
    fireEvent.press(getByTestId('add-user-btn'));
    // Wait for the sheet to show a villager row
    await waitFor(() => {
      expect(getByTestId(`villager-row-${OTHER_USER_ID}`)).toBeTruthy();
    });
    // Toggle the other user
    fireEvent.press(getByTestId(`villager-row-${OTHER_USER_ID}`));
    fireEvent.press(getByTestId('villager-confirm'));
    // Creator should remain, other user added
    expect(onChangeUsers).toHaveBeenCalledWith(expect.arrayContaining([CREATOR_ID, OTHER_USER_ID]));
  });

  it('does not allow the locked user to be deselected', async () => {
    const onChangeUsers = jest.fn();
    const { getByTestId } = render(
      <OrganizerPicker
        municipalityId={MUNICIPALITY_ID}
        selectedUserIds={[CREATOR_ID]}
        selectedOrgIds={[]}
        lockedUserId={CREATOR_ID}
        onChangeUsers={onChangeUsers}
        onChangeOrgs={jest.fn()}
      />,
    );
    await waitFor(() => {
      expect(getByTestId('add-user-btn')).toBeTruthy();
    });
    fireEvent.press(getByTestId('add-user-btn'));
    await waitFor(() => {
      expect(getByTestId(`villager-row-${CREATOR_ID}`)).toBeTruthy();
    });
    // Pressing the locked user row should not remove it
    fireEvent.press(getByTestId(`villager-row-${CREATOR_ID}`));
    fireEvent.press(getByTestId('villager-confirm'));
    // Creator must still be in the selection
    const calls = onChangeUsers.mock.calls;
    if (calls.length > 0) {
      expect(calls[calls.length - 1][0]).toContain(CREATOR_ID);
    }
    // Also verify the locked chip still renders
    expect(getByTestId(`chip-user-${CREATOR_ID}`)).toBeTruthy();
  });

  it('falls back to the user doc for a member the directory does not cover', async () => {
    // A member whose person doc is not linked to this village yet is absent
    // from `municipalityPeople`; they must still be listed, by name.
    mockGetMunicipalityPeople.mockResolvedValue([
      {
        id: `${MUNICIPALITY_ID}_p1`,
        userId: CREATOR_ID,
        displayName: 'Creator Name',
        sortName: 'creator name',
        photoURL: null,
      },
    ]);
    const { getByTestId, getByText } = render(
      <OrganizerPicker
        municipalityId={MUNICIPALITY_ID}
        selectedUserIds={[CREATOR_ID]}
        selectedOrgIds={[]}
        lockedUserId={CREATOR_ID}
        onChangeUsers={jest.fn()}
        onChangeOrgs={jest.fn()}
      />,
    );
    await waitFor(() => {
      expect(getByTestId('add-user-btn')).toBeTruthy();
    });
    fireEvent.press(getByTestId('add-user-btn'));
    await waitFor(() => {
      expect(getByTestId(`villager-row-${OTHER_USER_ID}`)).toBeTruthy();
    });
    expect(getByText(`Fallback ${OTHER_USER_ID}`)).toBeTruthy();
  });

  it('still lists every villager when the directory read is denied', async () => {
    // The directory query can be rejected outright; that must cost avatars and
    // ordering, never the villager list itself.
    mockGetMunicipalityPeople.mockRejectedValue(new Error('permission-denied'));
    const { getByTestId } = render(
      <OrganizerPicker
        municipalityId={MUNICIPALITY_ID}
        selectedUserIds={[CREATOR_ID]}
        selectedOrgIds={[]}
        lockedUserId={CREATOR_ID}
        onChangeUsers={jest.fn()}
        onChangeOrgs={jest.fn()}
      />,
    );
    await waitFor(() => {
      expect(getByTestId('add-user-btn')).toBeTruthy();
    });
    fireEvent.press(getByTestId('add-user-btn'));
    await waitFor(() => {
      expect(getByTestId(`villager-row-${OTHER_USER_ID}`)).toBeTruthy();
    });
    expect(getByTestId(`villager-row-${CREATOR_ID}`)).toBeTruthy();
  });

  it('reads the whole village in a fixed number of queries, not one per member', async () => {
    // Matabuena has 165 members; the old shape fanned out two reads per member.
    const many = Array.from({ length: 50 }, (_, i) => ({
      id: `u${i}`,
      userId: `u${i}`,
      role: 'user' as const,
      joinedAt: new Date(),
    }));
    mockGetVillageMembers.mockResolvedValue(many);
    mockGetMunicipalityPeople.mockResolvedValue(
      many.map((m, i) => ({
        id: `${MUNICIPALITY_ID}_${m.userId}`,
        userId: m.userId,
        displayName: `Villager ${i}`,
        sortName: `villager ${i}`,
        photoURL: null,
      })),
    );
    render(
      <OrganizerPicker
        municipalityId={MUNICIPALITY_ID}
        selectedUserIds={[]}
        selectedOrgIds={[]}
        onChangeUsers={jest.fn()}
        onChangeOrgs={jest.fn()}
      />,
    );
    await waitFor(() => {
      expect(mockGetMunicipalityPeople).toHaveBeenCalledTimes(1);
    });
    expect(mockGetVillageMembers).toHaveBeenCalledTimes(1);
    // Every member is covered by the directory, so no per-member fallback read.
    expect(mockGetPublicProfile).not.toHaveBeenCalled();
  });

  describe('search', () => {
    async function openVillagerSheet() {
      const utils = render(
        <OrganizerPicker
          municipalityId={MUNICIPALITY_ID}
          selectedUserIds={[CREATOR_ID]}
          selectedOrgIds={[]}
          lockedUserId={CREATOR_ID}
          onChangeUsers={jest.fn()}
          onChangeOrgs={jest.fn()}
        />,
      );
      await waitFor(() => {
        expect(utils.getByTestId('add-user-btn')).toBeTruthy();
      });
      fireEvent.press(utils.getByTestId('add-user-btn'));
      await waitFor(() => {
        expect(utils.getByTestId(`villager-row-${OTHER_USER_ID}`)).toBeTruthy();
      });
      return utils;
    }

    it('narrows the villager list to the matching rows', async () => {
      const { getByTestId, queryByTestId } = await openVillagerSheet();
      fireEvent.changeText(getByTestId('villager-row-search'), 'other');
      await waitFor(() => {
        expect(queryByTestId(`villager-row-${CREATOR_ID}`)).toBeNull();
      });
      expect(getByTestId(`villager-row-${OTHER_USER_ID}`)).toBeTruthy();
    });

    it('shows the empty-results message when nothing matches', async () => {
      const { getByTestId, queryByTestId } = await openVillagerSheet();
      fireEvent.changeText(getByTestId('villager-row-search'), 'zzz');
      await waitFor(() => {
        expect(getByTestId('villager-row-no-results')).toBeTruthy();
      });
      expect(queryByTestId(`villager-row-${OTHER_USER_ID}`)).toBeNull();
    });

    it('keeps a filtered-out selection when confirming', async () => {
      // Ticking a villager, then typing a term that hides them, must not drop
      // them: the selection is state, not a reading of what is on screen.
      const onChangeUsers = jest.fn();
      const { getByTestId } = render(
        <OrganizerPicker
          municipalityId={MUNICIPALITY_ID}
          selectedUserIds={[CREATOR_ID]}
          selectedOrgIds={[]}
          lockedUserId={CREATOR_ID}
          onChangeUsers={onChangeUsers}
          onChangeOrgs={jest.fn()}
        />,
      );
      await waitFor(() => {
        expect(getByTestId('add-user-btn')).toBeTruthy();
      });
      fireEvent.press(getByTestId('add-user-btn'));
      await waitFor(() => {
        expect(getByTestId(`villager-row-${OTHER_USER_ID}`)).toBeTruthy();
      });
      fireEvent.press(getByTestId(`villager-row-${OTHER_USER_ID}`));
      fireEvent.changeText(getByTestId('villager-row-search'), 'creator');
      fireEvent.press(getByTestId('villager-confirm'));
      expect(onChangeUsers).toHaveBeenCalledWith(
        expect.arrayContaining([CREATOR_ID, OTHER_USER_ID]),
      );
    });

    it('filters the group sheet too', async () => {
      mockGetOrganizationsByMunicipality.mockResolvedValue([
        { id: ORG_ID, name: 'Org One', municipalityId: MUNICIPALITY_ID, status: 'approved', images: [] },
        { id: 'org2', name: 'Peña Aragón', municipalityId: MUNICIPALITY_ID, status: 'approved', images: [] },
      ]);
      const { getByTestId, queryByTestId } = render(
        <OrganizerPicker
          municipalityId={MUNICIPALITY_ID}
          selectedUserIds={[CREATOR_ID]}
          selectedOrgIds={[]}
          lockedUserId={CREATOR_ID}
          onChangeUsers={jest.fn()}
          onChangeOrgs={jest.fn()}
        />,
      );
      await waitFor(() => {
        expect(getByTestId('add-org-btn')).toBeTruthy();
      });
      fireEvent.press(getByTestId('add-org-btn'));
      await waitFor(() => {
        expect(getByTestId(`org-row-${ORG_ID}`)).toBeTruthy();
      });
      // Accent-insensitive: "aragon" finds "Aragón".
      fireEvent.changeText(getByTestId('org-row-search'), 'aragon');
      await waitFor(() => {
        expect(queryByTestId(`org-row-${ORG_ID}`)).toBeNull();
      });
      expect(getByTestId('org-row-org2')).toBeTruthy();
    });

    // Layout can't be measured in jest, so this pins the property that keeps the
    // confirm footer on screen: without it a long group list pushed "Confirmar"
    // off the bottom of the sheet and a group could be ticked but never added.
    it('lets the group sheet body shrink so the confirm button stays visible', async () => {
      const { getByTestId } = render(
        <OrganizerPicker
          municipalityId={MUNICIPALITY_ID}
          selectedUserIds={[CREATOR_ID]}
          selectedOrgIds={[]}
          lockedUserId={CREATOR_ID}
          onChangeUsers={jest.fn()}
          onChangeOrgs={jest.fn()}
        />,
      );
      await waitFor(() => {
        expect(getByTestId('add-org-btn')).toBeTruthy();
      });
      fireEvent.press(getByTestId('add-org-btn'));
      expect(getByTestId('org-row-body')).toHaveStyle({ flexShrink: 1 });
      expect(getByTestId('org-confirm')).toBeTruthy();
    });
  });
});
