import { useEffect } from 'react';
import { Alert } from 'react-native';
import { observability } from '@cultuvilla/shared';
import { useT } from '../i18n';
import { takeOrphanedNotice } from './orphanedSession';

/**
 * Tells someone why the app opened signed out, when the launch before closed a
 * session whose account was deleted, disabled or revoked elsewhere (see
 * AuthContext). Mount once, inside I18nProvider.
 */
export function OrphanedSessionNotice(): null {
  const { t } = useT();
  useEffect(() => {
    void takeOrphanedNotice()
      .then((reason) => {
        if (!reason) return;
        const title =
          reason === 'accountGone'
            ? t('orphanedSession.accountGone.title')
            : t('orphanedSession.sessionExpired.title');
        const body =
          reason === 'accountGone'
            ? t('orphanedSession.accountGone.body')
            : t('orphanedSession.sessionExpired.body');
        Alert.alert(title, body, [{ text: t('orphanedSession.ok') }]);
      })
      .catch((err: unknown) => {
        observability.captureError(err, { operation: 'auth:orphanedSessionNotice' });
      });
    // Once per launch: the notice is consumed as it is read.
  }, []);
  return null;
}
