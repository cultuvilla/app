import { studioPairingPath } from '@cultuvilla/shared/utils/urls';
import { t } from '../i18n';

/**
 * The studio's QR code opened in a phone's browser instead of the app (an app
 * link the phone's OS did not claim). The custom scheme opens the app on the
 * same pairing screen.
 */
export function PhoneHandoffScreen({ pairingId }: { pairingId: string }) {
  return (
    <main className="sign-in">
      <section className="sign-in-card">
        <h1>{t('studio.web.phone.title')}</h1>
        <p className="lead">{t('studio.web.phone.body')}</p>
        <p>
          <a className="button primary" href={`cultuvilla:/${studioPairingPath(pairingId)}`}>
            {t('studio.web.phone.open')}
          </a>
        </p>
        <p className="muted small">
          {t('studio.web.signIn.noApp')} <a href="/descarga">{t('studio.web.signIn.download')}</a>
        </p>
      </section>
    </main>
  );
}
