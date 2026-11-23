import { PubSub } from '@google-cloud/pubsub';
import { logger } from 'firebase-functions/v2';
import { NOTIFY_TOPIC, notifyEnvelope, type NotifyMessage } from '@cultuvilla/shared/models';

let client: PubSub | undefined;

/**
 * Sends one message toward the Cultuvilla Telegram group: an envelope on this
 * project's `notify` topic, which the homelab notify-gateway pulls —
 * production's only; the dev and beta topics have no subscriber, so Pub/Sub
 * drops their messages.
 *
 * Throws when the publish fails, so a create-once trigger's retry sends it
 * again (the gateway dedupes the repeat on the envelope's key). Under the
 * emulators it refuses unless a Pub/Sub emulator is named: the suites run with
 * ADC that can reach the real dev project.
 */
export async function publishNotify(message: NotifyMessage): Promise<void> {
  const emulated = process.env['FUNCTIONS_EMULATOR'] === 'true' || Boolean(process.env['FIRESTORE_EMULATOR_HOST']);
  if (emulated && !process.env['PUBSUB_EMULATOR_HOST']) {
    logger.info('notify skipped: emulated runtime without PUBSUB_EMULATOR_HOST', { title: message.title });
    return;
  }
  const json = notifyEnvelope(process.env['GCLOUD_PROJECT'], message);
  client ??= new PubSub();
  await client.topic(NOTIFY_TOPIC).publishMessage({ json });
}
