import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { sendGroupMessage } from '@cultuvilla/shared/services/groupMessageService';
import { SocioAvisoComposer } from '../SocioAvisoComposer';

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() } }));
jest.mock('../../../../lib/i18n', () => ({
  useT: () => ({
    locale: 'es',
    t: (k: string, v?: Record<string, unknown>) => (v ? `${k}:${Object.values(v).map(String).join('|')}` : k),
  }),
}));
jest.mock('@cultuvilla/shared/services/groupMessageService', () => ({
  newGroupMessageId: () => 'Msg0000000001',
  sendGroupMessage: jest.fn(),
}));

const send = sendGroupMessage as jest.MockedFunction<typeof sendGroupMessage>;

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  send.mockResolvedValue({ messageId: 'Msg0000000001', recipientCount: 12, pushCount: 9, emailCount: 0, whatsappCount: 0 });
});

describe('SocioAvisoComposer', () => {
  it('offers a subject and a text, and nothing else an aviso can carry', () => {
    const { getByTestId, queryByTestId } = render(<SocioAvisoComposer orgId="org1" />);
    expect(queryByTestId('group-socio-aviso')).toBeNull();
    fireEvent.press(getByTestId('group-socio-aviso-open'));
    expect(getByTestId('group-socio-aviso-subject')).toBeTruthy();
    expect(getByTestId('group-socio-aviso-body')).toBeTruthy();
    for (const id of ['group-msg-audience', 'group-msg-push', 'group-msg-email', 'group-msg-whatsapp', 'group-msg-poll', 'group-msg-placeholders']) {
      expect(queryByTestId(id)).toBeNull();
    }
  });

  it('sends the text to every socio, in the app only, and says how many it reached', async () => {
    const { getByTestId, queryByTestId } = render(<SocioAvisoComposer orgId="org1" />);
    fireEvent.press(getByTestId('group-socio-aviso-open'));
    fireEvent.changeText(getByTestId('group-socio-aviso-subject'), 'Se vende leña');
    fireEvent.changeText(getByTestId('group-socio-aviso-body'), 'Preguntad por Paco.');
    fireEvent.press(getByTestId('group-socio-aviso-send'));
    await waitFor(() =>
      expect(send).toHaveBeenCalledWith({
        orgId: 'org1',
        messageId: 'Msg0000000001',
        title: 'Se vende leña',
        body: 'Preguntad por Paco.',
        audience: { kind: 'all', eventId: null },
        channels: { push: true, email: false, whatsapp: 'none' },
        pinned: false,
        poll: null,
      }),
    );
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith(expect.stringContaining('groups.messages.sent:12')));
    expect(queryByTestId('group-socio-aviso')).toBeNull();
  });

  it('asks for what is missing before sending anything', () => {
    const { getByTestId, getByText } = render(<SocioAvisoComposer orgId="org1" />);
    fireEvent.press(getByTestId('group-socio-aviso-open'));
    fireEvent.press(getByTestId('group-socio-aviso-send'));
    expect(getByText('groups.messages.subjectRequired')).toBeTruthy();
    expect(send).not.toHaveBeenCalled();
  });

  it('says so when the junta switched it off meanwhile, and keeps the text', async () => {
    send.mockRejectedValue(Object.assign(new Error('No autorizado.'), { code: 'functions/permission-denied' }));
    const { getByTestId } = render(<SocioAvisoComposer orgId="org1" />);
    fireEvent.press(getByTestId('group-socio-aviso-open'));
    fireEvent.changeText(getByTestId('group-socio-aviso-subject'), 'Hola');
    fireEvent.changeText(getByTestId('group-socio-aviso-body'), 'Texto');
    fireEvent.press(getByTestId('group-socio-aviso-send'));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith(expect.stringContaining('groups.messages.socioNotAllowed')));
    expect(getByTestId('group-socio-aviso-subject').props.value).toBe('Hola');
  });
});
