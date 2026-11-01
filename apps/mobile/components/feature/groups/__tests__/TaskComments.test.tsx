import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { addTaskComment, deleteTaskComment } from '@cultuvilla/shared/services/groupTaskService';
import { resetWatchers, setWatched } from '../../../../test/watchers';
import { TaskComments } from '../TaskComments';

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../../../../lib/i18n', () => ({ useT: () => ({ locale: 'es', t: (k: string) => k }) }));
jest.mock('@cultuvilla/shared/services/groupTaskService', () => ({
  watchTaskComments: jest.requireActual<typeof import('../../../../test/watchers')>('../../../../test/watchers').mockWatcher('comments'),
  addTaskComment: jest.fn().mockResolvedValue('new'),
  deleteTaskComment: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@cultuvilla/shared/services/userService', () => ({
  getPublicProfile: jest.fn().mockResolvedValue({ id: 'u1', displayName: 'Ana' }),
}));
jest.mock('../../../../lib/orgs/useOrgMembers', () => ({ useMemberFaces: () => ({}) }));

const comment = (id: string, authorUid: string, minutesAgo: number) => ({
  id, authorUid, authorName: `name-${authorUid}`, body: `body-${id}`, createdAt: new Date(Date.now() - minutesAgo * 60_000),
});

beforeEach(() => {
  resetWatchers();
  jest.clearAllMocks();
});

describe('TaskComments', () => {
  it('invites the first comment on an empty task', () => {
    setWatched('comments', []);
    const { getByTestId } = render(<TaskComments orgId="org1" taskId="t1" uid="u1" isAdmin={false} />);
    expect(getByTestId('task-comments-empty')).toBeTruthy();
  });

  it('lists oldest first, and a member deletes only their own', () => {
    setWatched('comments', [comment('new', 'u1', 1), comment('old', 'u2', 9)]);
    const { getAllByTestId, getByTestId, queryByTestId } = render(<TaskComments orgId="org1" taskId="t1" uid="u1" isAdmin={false} />);
    expect(getAllByTestId(/^task-comment-(new|old)$/).map((n) => n.props.testID)).toEqual(['task-comment-old', 'task-comment-new']);
    expect(getByTestId('task-comment-old')).toHaveTextContent(/name-u2.*body-old/);
    expect(getByTestId('task-comment-delete-new')).toBeTruthy();
    expect(queryByTestId('task-comment-delete-old')).toBeNull();
  });

  it('an admin deletes anyone\'s, after confirming', async () => {
    const confirm = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      buttons?.find((b) => b.style !== 'cancel')?.onPress?.();
    });
    setWatched('comments', [comment('old', 'u2', 9)]);
    const { getByTestId } = render(<TaskComments orgId="org1" taskId="t1" uid="admin" isAdmin />);
    fireEvent.press(getByTestId('task-comment-delete-old'));
    await waitFor(() => expect(deleteTaskComment).toHaveBeenCalledWith('org1', 't1', 'old'));
    confirm.mockRestore();
  });

  it('sends under the public name and clears the box', async () => {
    setWatched('comments', []);
    const { getByTestId } = render(<TaskComments orgId="org1" taskId="t1" uid="u1" isAdmin={false} />);
    fireEvent.changeText(getByTestId('task-comment-input'), 'Voy yo');
    fireEvent.press(getByTestId('task-comment-send'));
    await waitFor(() =>
      expect(addTaskComment).toHaveBeenCalledWith({ orgId: 'org1', taskId: 't1', uid: 'u1', authorName: 'Ana', body: 'Voy yo' }),
    );
    await waitFor(() => expect(getByTestId('task-comment-input').props.value).toBe(''));
  });

  it('offers older comments only when the page is full', () => {
    setWatched('comments', Array.from({ length: 50 }, (_, i) => comment(`c${String(i)}`, 'u2', i)));
    const { getByTestId } = render(<TaskComments orgId="org1" taskId="t1" uid="u1" isAdmin={false} />);
    expect(getByTestId('task-comments-older')).toBeTruthy();
  });
});
