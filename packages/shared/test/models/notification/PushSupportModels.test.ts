import { describe, it, expect } from 'vitest';
import {
  DeviceTokenDataSchema,
  buildDeviceTokenData,
} from '../../../src/models/notification/DeviceTokenDataModel';
import {
  DEFAULT_NOTIFICATION_PREFS,
  allowsPush,
  NOTIFICATION_PREF_KEYS,
  buildNotificationPrefsData,
} from '../../../src/models/notification/NotificationPrefsDataModel';
import { buildPushQueueData, pushQueueId } from '../../../src/models/notification/PushQueueDataModel';
import {
  BROADCAST_ENTITY_KINDS,
  isBroadcastEntityKind,
  villageEntityPublishedCopy,
} from '../../../src/models/notification/VillageEntityCopy';

describe('DeviceTokenData', () => {
  it('forces the APNs fields to null on Android, whatever the caller passed', () => {
    const d = buildDeviceTokenData({
      token: 'fcm',
      platform: 'android',
      apnsEnvironment: 'production',
      apnsTopic: 'com.cultuvilla.app',
      appVersion: '1.2.0',
    });
    expect(d.apnsEnvironment).toBeNull();
    expect(d.apnsTopic).toBeNull();
    expect(DeviceTokenDataSchema.safeParse(d).success).toBe(true);
  });

  it('accepts an iOS token that names its gateway and topic', () => {
    const d = buildDeviceTokenData({
      token: 'apns',
      platform: 'ios',
      apnsEnvironment: 'sandbox',
      apnsTopic: 'com.cultuvilla.app.dev',
      appVersion: '1.2.0',
    });
    expect(DeviceTokenDataSchema.safeParse(d).success).toBe(true);
  });

  it('rejects an iOS token without an APNs gateway — it would be undeliverable', () => {
    const d = buildDeviceTokenData({ token: 'apns', platform: 'ios', appVersion: '1.2.0' });
    expect(DeviceTokenDataSchema.safeParse(d).success).toBe(false);
  });
});

describe('NotificationPrefs', () => {
  it('defaults every category on, with quiet hours on', () => {
    expect(DEFAULT_NOTIFICATION_PREFS).toMatchObject({
      mine: true,
      village: true,
      social: true,
      quietHours: true,
    });
  });

  it('fills unspecified toggles from the defaults', () => {
    const p = buildNotificationPrefsData({ village: false });
    expect(p).toMatchObject({ mine: true, village: false, social: true, quietHours: true });
  });

  it('gates push per category', () => {
    const p = buildNotificationPrefsData({ social: false });
    expect(allowsPush(p, 'mine')).toBe(true);
    expect(allowsPush(p, 'social')).toBe(false);
  });

  it('leaves group messages to the per-group mute, whatever the account toggles', () => {
    const p = buildNotificationPrefsData({ mine: false, village: false, social: false });
    expect(allowsPush(p, 'groups')).toBe(true);
    expect(NOTIFICATION_PREF_KEYS).toEqual(['mine', 'village', 'social']);
  });
});

describe('PushQueue', () => {
  it('derives one deterministic id per user per notification', () => {
    expect(pushQueueId('u1', 'n1')).toBe('u1__n1');
    expect(pushQueueId('u1', 'n1')).toBe(pushQueueId('u1', 'n1'));
  });

  it('starts unsent with zero counts', () => {
    const q = buildPushQueueData({
      userId: 'u',
      notificationId: 'n',
      category: 'village',
      sendAfter: new Date(0),
    });
    expect(q).toMatchObject({ sentAt: null, deliveredCount: 0, failedCount: 0 });
  });
});

describe('villageEntityPublishedCopy', () => {
  it('names the kind and the village, and quotes the entity', () => {
    expect(villageEntityPublishedCopy('event', 'Verbena', 'Matabuena')).toEqual({
      title: 'Nuevo evento en Matabuena',
      body: '«Verbena»',
    });
  });

  it('falls back to a sentence when the entity has no name', () => {
    for (const label of [null, '', '   ']) {
      const copy = villageEntityPublishedCopy('festivalPoster', label, 'Matabuena');
      expect(copy.body).toBe('Un cartel de fiestas nuevo en tu pueblo.');
    }
  });

  it('covers the entity family and excludes vocabulary terms', () => {
    expect([...BROADCAST_ENTITY_KINDS].sort()).toEqual(
      ['barrio', 'event', 'festivalPoster', 'historyEntry', 'news', 'organization', 'place'].sort(),
    );
    expect(isBroadcastEntityKind('vocabularyTerm')).toBe(false);
    for (const kind of BROADCAST_ENTITY_KINDS) {
      expect(villageEntityPublishedCopy(kind, 'X', 'V').title).toMatch(/ en V$/);
    }
  });
});
