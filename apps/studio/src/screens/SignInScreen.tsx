import { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { palette } from '@cultuvilla/shared/design-system';
import { firebaseErrorCode } from '@cultuvilla/shared/firebase/sdk/errors';
import type { CreateStudioPairingResult } from '@cultuvilla/shared/models/studio/studioPairing';
import { claimStudioPairing, createStudioPairing } from '@cultuvilla/shared/services/studioService';
import { studioPairingPath } from '@cultuvilla/shared/utils/urls';
import { useStudioAuth } from '../auth/StudioAuth';
import { siteOrigin } from '../firebase';
import { t } from '../i18n';

const POLL_MS = 2500;
// Polls that may fail in a row (a flaky connection) before the screen says so.
const MAX_POLL_FAILURES = 4;

type Status =
  | { kind: 'preparing' }
  | { kind: 'waiting'; pairing: CreateStudioPairingResult; qr: string }
  | { kind: 'signingIn' }
  | { kind: 'expired' }
  | { kind: 'error' };

/**
 * Sign-in by pairing with the app: show a QR code, wait for the signed-in app
 * to approve it, then sign in with the token the approval releases.
 */
export function SignInScreen() {
  const { signInWithPairingToken } = useStudioAuth();
  const [status, setStatus] = useState<Status>({ kind: 'preparing' });
  const [attempt, setAttempt] = useState(0);
  const renew = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;
    setStatus({ kind: 'preparing' });

    async function poll(pairing: CreateStudioPairingResult) {
      if (cancelled) return;
      if (Date.now() > pairing.expiresAt) {
        setStatus({ kind: 'expired' });
        return;
      }
      try {
        const result = await claimStudioPairing({ pairingId: pairing.pairingId, claimSecret: pairing.claimSecret });
        if (cancelled) return;
        failures = 0;
        if (result.status === 'approved') {
          setStatus({ kind: 'signingIn' });
          await signInWithPairingToken(result.token);
          return;
        }
      } catch (error) {
        if (cancelled) return;
        if (firebaseErrorCode(error) === 'not-found') {
          setStatus({ kind: 'expired' });
          return;
        }
        failures += 1;
        if (failures >= MAX_POLL_FAILURES) {
          setStatus({ kind: 'error' });
          return;
        }
      }
      timer = setTimeout(() => void poll(pairing), POLL_MS);
    }

    void (async () => {
      try {
        const pairing = await createStudioPairing();
        const qr = await QRCode.toDataURL(`${siteOrigin()}${studioPairingPath(pairing.pairingId)}`, {
          margin: 1,
          width: 240,
          color: { dark: palette.olive, light: '#ffffff' },
        });
        if (cancelled) return;
        setStatus({ kind: 'waiting', pairing, qr });
        timer = setTimeout(() => void poll(pairing), POLL_MS);
      } catch {
        if (!cancelled) setStatus({ kind: 'error' });
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [attempt, signInWithPairingToken]);

  return (
    <main className="sign-in">
      <section className="sign-in-card">
        <h1>{t('studio.web.name')}</h1>
        <p className="lead">{t('studio.web.tagline')}</p>
        <div className="pairing">
          <div className="qr" aria-live="polite">
            {status.kind === 'waiting' ? (
              <img src={status.qr} width={240} height={240} alt="" />
            ) : status.kind === 'expired' || status.kind === 'error' ? (
              <div className="qr-message">
                <p>{t(status.kind === 'expired' ? 'studio.web.signIn.expired' : 'studio.web.signIn.error')}</p>
                <button type="button" className="button primary" onClick={renew}>
                  {t('studio.web.signIn.renew')}
                </button>
              </div>
            ) : (
              <div className="qr-message">
                <p>{t(status.kind === 'signingIn' ? 'studio.web.signIn.signingIn' : 'common.loading')}</p>
              </div>
            )}
          </div>
          <div className="pairing-steps">
            <h2>{t('studio.web.signIn.title')}</h2>
            <ol>
              <li>{t('studio.web.signIn.step1')}</li>
              <li>{t('studio.web.signIn.step2')}</li>
              <li>{t('studio.web.signIn.step3')}</li>
            </ol>
            {status.kind === 'waiting' ? (
              <p className="pairing-code">
                {t('studio.web.signIn.codeLabel')}: <strong>{status.pairing.code}</strong>
                <span className="muted"> · {t('studio.web.signIn.waiting')}</span>
              </p>
            ) : null}
          </div>
        </div>
        <p className="muted small">{t('studio.web.signIn.sessionNote')}</p>
        <p className="muted small">
          {t('studio.web.signIn.noApp')} <a href="/descarga">{t('studio.web.signIn.download')}</a>
        </p>
      </section>
    </main>
  );
}
