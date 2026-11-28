import { render, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { I18nProvider } from '../../i18n';
import { OrphanedSessionNotice } from '../OrphanedSessionNotice';
import { rememberOrphanedNotice } from '../orphanedSession';

describe('OrphanedSessionNotice', () => {
  let alert: jest.SpyInstance;

  beforeEach(async () => {
    await AsyncStorage.clear();
    alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });
  afterEach(() => alert.mockRestore());

  const mount = () =>
    render(
      <I18nProvider>
        <OrphanedSessionNotice />
      </I18nProvider>,
    );

  it('tells someone whose account is gone why they are signed out', async () => {
    await rememberOrphanedNotice('accountGone');
    mount();

    await waitFor(() =>
      expect(alert).toHaveBeenCalledWith(
        'Tu cuenta ya no está disponible',
        'Hemos cerrado la sesión en este dispositivo.',
        [{ text: 'Entendido' }],
      ),
    );
  });

  it('tells someone whose session was revoked to sign in again', async () => {
    await rememberOrphanedNotice('sessionExpired');
    mount();

    await waitFor(() =>
      expect(alert).toHaveBeenCalledWith('Tu sesión ha caducado', 'Vuelve a iniciar sesión para seguir.', [
        { text: 'Entendido' },
      ]),
    );
  });

  it('says nothing on an ordinary launch', async () => {
    mount();
    await new Promise((r) => setTimeout(r, 0));
    expect(alert).not.toHaveBeenCalled();
  });
});
