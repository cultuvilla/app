import { Alert, Linking } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import {
  nudgeGroupMessage,
  sendGroupMessage,
  setGroupMessagePinned,
  setWhatsappSent,
} from '@cultuvilla/shared/services/groupMessageService';
import { resetWatchers, setWatched } from '../../../../test/watchers';
import { GroupMessagesAdmin } from '../GroupMessagesAdmin';

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
jest.mock('@cultuvilla/shared/services/groupMessageService', () => {
  const { mockWatcher } = jest.requireActual<typeof import('../../../../test/watchers')>('../../../../test/watchers');
  return {
    watchGroupMessages: mockWatcher('messages'),
    watchGroupMessageDeliveries: mockWatcher('deliveries'),
    watchGroupMessageReads: mockWatcher('reads'),
    watchGroupPollVotes: mockWatcher('votes'),
    newGroupMessageId: () => 'Msg0000000001',
    sendGroupMessage: jest.fn().mockResolvedValue({ messageId: 'Msg0000000001', recipientCount: 3, pushCount: 2, emailCount: 2, whatsappCount: 1 }),
    nudgeGroupMessage: jest.fn().mockResolvedValue({ nudged: 1 }),
    setGroupMessagePinned: jest.fn().mockResolvedValue(undefined),
    setWhatsappSent: jest.fn().mockResolvedValue(undefined),
  };
});
jest.mock('@cultuvilla/shared/services/cuotaService', () => ({
  watchCuotaSettings: jest.requireActual<typeof import('../../../../test/watchers')>('../../../../test/watchers').mockWatcher('cuota'),
}));
jest.mock('@cultuvilla/shared/services/eventService', () => ({
  watchEventsByOrganization: jest.requireActual<typeof import('../../../../test/watchers')>('../../../../test/watchers').mockWatcher('events'),
}));
jest.mock('@cultuvilla/shared/services/socioService', () => ({
  watchOrgSocioPrivates: jest.requireActual<typeof import('../../../../test/watchers')>('../../../../test/watchers').mockWatcher('privates'),
}));
jest.mock('@cultuvilla/shared/services/deepLinkService', () => ({ getDeepLinkHost: () => 'cultuvilla.es' }));

const MESSAGE = {
  id: 'm1',
  title: 'Cena',
  body: 'Elegid fecha.',
  audience: { kind: 'all', eventId: null, eventTitle: null },
  channels: { push: true, email: true, whatsapp: 'fallback' },
  pinned: false,
  poll: { question: '¿12 o 19?', kind: 'choice', options: ['12', '19'] },
  recipientUids: ['admin', 'u-paco', 'u-eva'],
  recipientCount: 4,
  pushCount: 2,
  emailCount: 3,
  whatsappCount: 1,
  sentBy: 'admin',
  signerName: 'Luis',
  signerTitle: 'presidente',
  sentAt: new Date('2026-10-20T10:00:00Z'),
  nudgeCount: 0,
  lastNudgedAt: null,
};

const delivery = (id: string, over: Record<string, unknown>) => ({
  id, uid: id, socioIds: [id], names: [id], push: true, email: 'sent', whatsappSocioId: null, whatsappSentAt: null, whatsappSentBy: null, ...over,
});

beforeEach(() => {
  resetWatchers();
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  setWatched('cuota', null);
  setWatched('events', [{ id: 'ev1', title: 'Fiestas', startDate: new Date('2026-08-14'), organizerOrgIds: ['org1'], status: 'published', series: null }]);
});

function renderAdmin() {
  return render(<GroupMessagesAdmin orgId="org1" orgName="La Anduela" uid="admin" includePrivateEvents={false} />);
}

describe('GroupMessagesAdmin', () => {
  it('composes and sends a message to the people of an event, with a poll', async () => {
    setWatched('messages', []);
    const { getByTestId, getByText, queryByTestId } = renderAdmin();
    expect(getByText('groups.messages.empty')).toBeTruthy();
    // No cuota configured: no cuota audience.
    fireEvent.press(getByTestId('group-msg-compose-open'));
    expect(queryByTestId('group-msg-audience-cuota')).toBeNull();

    fireEvent.press(getByTestId('group-msg-send'));
    expect(getByText('groups.messages.subjectRequired')).toBeTruthy();

    fireEvent.changeText(getByTestId('group-msg-subject'), 'Cena');
    fireEvent.changeText(getByTestId('group-msg-body'), 'Elegid fecha.');
    fireEvent.press(getByTestId('group-msg-audience-event'));
    fireEvent.press(getByTestId('group-msg-send'));
    expect(getByText('groups.messages.eventRequired')).toBeTruthy();
    fireEvent.press(getByTestId('group-msg-event-ev1'));
    fireEvent.press(getByTestId('group-msg-whatsapp-fallback'));
    fireEvent.press(getByTestId('group-msg-pinned'));
    fireEvent.press(getByTestId('group-msg-poll-yes_no'));
    fireEvent.changeText(getByTestId('group-msg-poll-question'), '¿Vienes?');
    fireEvent.press(getByTestId('group-msg-send'));

    await waitFor(() => expect(sendGroupMessage).toHaveBeenCalledTimes(1));
    expect(sendGroupMessage).toHaveBeenCalledWith({
      orgId: 'org1',
      messageId: 'Msg0000000001',
      title: 'Cena',
      body: 'Elegid fecha.',
      audience: { kind: 'event', eventId: 'ev1' },
      channels: { push: true, email: true, whatsapp: 'fallback' },
      pinned: true,
      poll: { question: '¿Vienes?', kind: 'yes_no', options: ['groups.messages.yes', 'groups.messages.no'] },
    });
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith(expect.stringContaining('groups.messages.sent:3')));
  });

  it('shows who has not read, nudges them, and the poll results with the voters', async () => {
    setWatched('messages', [MESSAGE]);
    setWatched('deliveries', [delivery('admin', { push: false }), delivery('u-paco', { names: ['Paco', 'Nene'] }), delivery('u-eva', { names: ['Eva'] })]);
    setWatched('reads', [{ id: 'u-eva', readAt: new Date() }]);
    setWatched('votes', [{ id: 'u-eva', option: 1, votedAt: new Date() }]);
    setWatched('privates', []);
    const { getByTestId } = renderAdmin();
    expect(getByTestId('group-msg-row-m1')).toHaveTextContent(/groups\.messages\.counts:4\|2\|3/);
    fireEvent.press(getByTestId('group-msg-row-m1'));

    expect(getByTestId('group-msg-detail-reads')).toHaveTextContent(/groups\.messages\.readBy:1\|2/);
    expect(getByTestId('group-msg-detail-reads')).toHaveTextContent(/Paco, Nene/);
    fireEvent.press(getByTestId('group-msg-detail-nudge'));
    await waitFor(() => expect(nudgeGroupMessage).toHaveBeenCalledWith('org1', 'm1'));

    expect(getByTestId('group-msg-detail-option-1')).toHaveTextContent(/groups\.messages\.votes:1/);
    expect(getByTestId('group-msg-detail-option-1')).toHaveTextContent(/Eva/);

    fireEvent.press(getByTestId('group-msg-detail-pin'));
    expect(setGroupMessagePinned).toHaveBeenCalledWith('org1', 'm1', true);
  });

  it('waits before another nudge', () => {
    setWatched('messages', [{ ...MESSAGE, lastNudgedAt: new Date(), nudgeCount: 1 }]);
    setWatched('deliveries', [delivery('u-paco', {})]);
    setWatched('reads', []);
    setWatched('votes', []);
    setWatched('privates', []);
    const { getByTestId, queryByTestId } = renderAdmin();
    fireEvent.press(getByTestId('group-msg-row-m1'));
    expect(queryByTestId('group-msg-detail-nudge')).toBeNull();
    expect(getByTestId('group-msg-detail-nudge-wait')).toBeTruthy();
  });

  it('opens WhatsApp with the message written and ticks it sent', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    setWatched('messages', [MESSAGE]);
    setWatched('deliveries', [delivery('typed_Pepa', { uid: null, push: false, email: null, names: ['Pepa'], whatsappSocioId: 'Pepa' })]);
    setWatched('reads', []);
    setWatched('votes', []);
    setWatched('privates', [{ id: 'Pepa', phone: '600 111 222', email: null, consentAnsweredAt: null }]);
    const { getByTestId } = renderAdmin();
    fireEvent.press(getByTestId('group-msg-row-m1'));
    fireEvent.press(getByTestId('group-msg-wa-open-typed_Pepa'));
    expect(open).toHaveBeenCalledWith(expect.stringMatching(/^https:\/\/wa\.me\/34600111222\?text=\*Cena\*%0A%0AElegid/));
    await waitFor(() => expect(setWhatsappSent).toHaveBeenCalledWith('org1', 'm1', 'typed_Pepa', 'admin', true));
  });

  it('edits a multiple-choice poll and the channels, to everyone with WhatsApp', async () => {
    setWatched('messages', []);
    setWatched('cuota', { id: 'current' });
    const { getByTestId, queryByTestId } = renderAdmin();
    expect(getByTestId('group-msg-admin')).toBeTruthy();
    fireEvent.press(getByTestId('group-msg-compose-open'));
    expect(getByTestId('group-msg-compose')).toBeTruthy();
    expect(getByTestId('group-msg-compose-scroll')).toBeTruthy();
    expect(getByTestId('group-msg-audience')).toBeTruthy();
    fireEvent.press(getByTestId('group-msg-audience-cuota'));
    expect(queryByTestId('group-msg-events')).toBeNull();
    fireEvent.press(getByTestId('group-msg-audience-event'));
    expect(getByTestId('group-msg-events')).toBeTruthy();
    fireEvent.press(getByTestId('group-msg-audience-cuota'));
    fireEvent.changeText(getByTestId('group-msg-subject'), 'Fecha de la cena');
    fireEvent.changeText(getByTestId('group-msg-body'), 'Votad.');
    fireEvent.press(getByTestId('group-msg-push'));
    fireEvent.press(getByTestId('group-msg-email'));
    expect(getByTestId('group-msg-whatsapp')).toBeTruthy();
    fireEvent.press(getByTestId('group-msg-whatsapp-all'));
    expect(getByTestId('group-msg-poll')).toBeTruthy();
    fireEvent.press(getByTestId('group-msg-poll-choice'));
    fireEvent.changeText(getByTestId('group-msg-poll-question'), '¿Qué día?');
    fireEvent.press(getByTestId('group-msg-poll-add'));
    fireEvent.changeText(getByTestId('group-msg-poll-option-0'), '12');
    fireEvent.changeText(getByTestId('group-msg-poll-option-1'), '19');
    fireEvent.changeText(getByTestId('group-msg-poll-option-2'), 'nunca');
    fireEvent.press(getByTestId('group-msg-poll-remove-2'));
    fireEvent.press(getByTestId('group-msg-send'));
    await waitFor(() =>
      expect(sendGroupMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          audience: { kind: 'cuota', eventId: null },
          channels: { push: false, email: false, whatsapp: 'all' },
          poll: { question: '¿Qué día?', kind: 'choice', options: ['12', '19'] },
        }),
      ),
    );
  });

  it('lists the recipients with their channels and unticks a WhatsApp not sent', () => {
    setWatched('messages', [MESSAGE]);
    setWatched('deliveries', [
      delivery('u-paco', { email: 'failed', whatsappSocioId: 'Paco', whatsappSentAt: new Date(), whatsappSentBy: 'admin' }),
    ]);
    setWatched('reads', []);
    setWatched('votes', []);
    setWatched('privates', [{ id: 'Paco', phone: null, email: null, consentAnsweredAt: new Date() }]);
    const { getByTestId } = renderAdmin();
    fireEvent.press(getByTestId('group-msg-row-m1'));
    expect(getByTestId('group-msg-detail')).toBeTruthy();
    expect(getByTestId('group-msg-detail-scroll')).toBeTruthy();
    expect(getByTestId('group-msg-detail-poll')).toHaveTextContent(/groups\.messages\.noVotes/);
    expect(getByTestId('group-msg-detail-recipients')).toHaveTextContent(/groups\.messages\.emailFailed/);
    expect(getByTestId('group-msg-detail-whatsapp')).toHaveTextContent(/groups\.messages\.whatsappNoPhone/);
    fireEvent.press(getByTestId('group-msg-wa-sent-u-paco'));
    expect(setWhatsappSent).toHaveBeenCalledWith('org1', 'm1', 'u-paco', 'admin', false);
  });
});
