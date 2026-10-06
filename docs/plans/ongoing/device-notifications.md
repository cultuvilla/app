# Device notifications (push) — design and rollout

**Priority:** high
**Landed:** prod
**Gate:** blocked:the Apple developer Account Holder must create the APNs key (.p8 + Key ID) — see *Blocker: the APNs key*
**Next:** load the real APNs key into `APNS_AUTH_KEY` on `cultuvilla-prod`, redeploy the push functions, and verify delivery on an iPhone

## Done

Merged: #337 (code), #344 (Android config). Each item below was verified from the source of truth, not from a checklist:

- All 9 push functions ACTIVE on `cultuvilla-prod`
  (`gcloud functions list --project=cultuvilla-prod`).
- The published store builds carry the push code (iOS 1.4.1, Android 1.5.0).
- The mechanism provably works end to end: prod logs show
  `onNotificationCreated` deferring overnight broadcasts and `flushPushQueue`
  draining them the next morning — ~1,389 in 14 days (6 runs at the 200 cap,
  plus 178 and 11), zero errors.
- `APNS_AUTH_KEY` exists in all three envs, so no deploy can fail on it.
- Android `google-services.json` committed for **all three** envs, locked by
  `packages/shared/test/ci/googleServices.test.ts`. Beta gained its own
  (`com.cultuvilla.app.beta`) when beta became its own Play app — see
  [beta-is-its-own-play-app.md](../../decisions/beta-is-its-own-play-app.md).
- `PUSH_NOTIFICATIONS` capability on bundle id `com.cultuvilla.app`, added via
  the ASC API on 2026-09-14.

## Next steps

In order — the first is the whole blocker:

1. **Load the real APNs key.** Ask Jaime for it (see *Blocker: the APNs key*), then:
   `printf '%s' '{"keyId":"<KEYID>","privateKey":"<.p8 contents with real newlines>"}' | gcloud secrets versions add APNS_AUTH_KEY --data-file=- --project=cultuvilla-prod`
   (repeat for `villa-events` to test on a dev build). **A new version only
   takes effect on the next deploy of the push functions** — v2 binds the
   version at deploy time — so re-run the env's deploy afterwards.
2. **Verify it worked** rather than assuming: sign in on an iPhone, accept the
   ask, then
   `gcloud logging read 'jsonPayload.handler="deliverPush"' --project=cultuvilla-prod --freshness=1d --format="value(jsonPayload.iosCount,jsonPayload.delivered,jsonPayload.failed)"`.
   Success is `delivered >= 1` with `failed 0`; while the key is missing the
   line reads `iosCount 1, delivered 0, failed 1` next to a
   `sendApns: APNS_AUTH_KEY is missing or malformed` warning.
3. **Restore the time-sensitive entitlement** in `apps/mobile/app.config.ts`
   (currently commented out, ~line 196) once Jaime ticks that box in the
   portal. It needs a new store build to reach anyone.
4. **Play Data Safety:** declare "Device or other IDs". The Android listing is
   public since 2026-09-29, so the reason for holding off is gone.

## Blocker: the APNs key

- **Only Jaime can create the APNs key.** The Apple account is *Individual*,
  so Certificates, Identifiers & Profiles is Account-Holder-only and no App
  Store Connect role delegates it. Exact ask: developer.apple.com → Keys →
  **+**, tick *Apple Push Notifications service*, **Configure** → Environment
  **Sandbox & Production**, Key type **Team Scoped**, Register, Download. The
  `.p8` downloads **once**. Needed: the file plus its **Key ID**.
  Sandbox & Production because dev builds use the sandbox gateway and store
  builds production; Team Scoped so one key covers `.dev`, `.beta` and the
  store app.
- `AuthKey_533TUZ9L4M.p8` (in `/mnt/c/Users/alvar/Downloads`) is **not** it —
  that Key ID is `APPLE_ASC_KEY_ID`, the App Store Connect API key. ASC keys
  cannot authenticate to APNs. Don't retry it.

## Handoff

- **Android has 0 registered device tokens so far** (every `deliverPush` line
  shows `androidCount 0`). Expected — the listing went public 2026-09-29 — but
  if it is still 0 a week later, verify the Android token path on a real device
  instead of trusting it; that path depends on the committed
  `google-services.json` and fails silently when wrong.
- `deliverPush` **returns before logging** when a user has no device, which is
  why ~1,389 flushed pushes produced only 2 delivery lines. Low log volume is
  not evidence of a broken queue.
- **`pushQueue` docs are never deleted** — ~1,400 already. Harmless now;
  the clean fix is a Firestore TTL policy on `sentAt`. Not yet done.
- iOS failure is silent by design: a missing key logs a warning and skips iOS,
  so nothing alerts. The log query in *Next* step 2 is the only check.
- The whole Android/iOS behaviour split lives in one file,
  `packages/shared/src/models/notification/PushEnvelope.ts`; the only seam
  between the notification log and a device is
  `functions/src/push/onNotificationCreated.ts`.

## Rollout status

| Step | Dev | Beta | Prod |
|---|---|---|---|
| Push code deployed | ✅ | ✅ | ✅ (9 functions ACTIVE) |
| `APNS_AUTH_KEY` secret exists | ✅ placeholder `{}` | ✅ placeholder `{}` | ✅ placeholder `{}` |
| **Real APNs `.p8` in the secret** | ⬜ | ⬜ | ⬜ **the blocker** |
| Android `google-services.json` | ✅ | ✅ (beta is its own Play app) | ✅ |
| Push Notifications capability on the App ID | — | — | ✅ 2026-09-14 |
| Time-sensitive capability + entitlement | — | — | ⬜ portal-only (Jaime) |
| Play Data Safety declares device IDs | — | — | ⬜ |
| Store binary carrying push | — | — | ✅ iOS 1.4.1 / Android 1.5.0 |
| Verified delivery on a real device | ⬜ | ⬜ | ⬜ blocked on the key |

Legend: ⬜ pending · ⏳ in progress · ✅ done · ⚠️ blocked (note inline)

**Retire this plan** once a real device receives a push on both platforms and the
time-sensitive entitlement is restored — then distil anything durable that isn't
already in the Decisions section below, and delete the file.

## Context

Before this change, "notifications" meant one thing: an append-only Firestore
log at `users/{uid}/notifications/{nid}`, rendered in the Buzón
([unified-inbox.md](../../decisions/unified-inbox.md)). Nothing ever reached the
device. Two consequences shaped the design:

1. **Every existing type was transactional** — a response to something the user
   had already done (their seat, their request, their comment). Nothing told a
   villager that something new had appeared in their pueblo, which is the entire
   reason a village app gets opened more than once a season.
2. **Push cannot be delivered over OTA.** `expo-notifications` is a config
   plugin, so it moves the native fingerprint; `runtimeVersion: 'fingerprint'`
   correctly refuses to serve it to installed binaries. Push ships in a store
   build or not at all.

## Decisions

### The notification log stays the single source of truth

Push is a **projection of the log, not a parallel channel**. One trigger,
`onNotificationCreated`, watches `users/{uid}/notifications/{nid}` and fans out
to the user's devices. Every one of the seven existing producers gained push
without learning that push exists, and the next producer gets it for free.

The alternative — a `notify()` helper each producer calls, dual-writing doc and
push — was rejected: two failure modes per call site, and the next producer
someone adds can forget to use it.

Deterministic notification ids (`signups_disabled_${eventId}`) keep working,
because a `set` over an existing id fires *update*, not *create*.

### Categories are derived, never stored

`notificationCategory(type)` is a pure lookup in
[NotificationCategory.ts](../../../packages/shared/src/models/notification/NotificationCategory.ts).
Storing a `category` field on the notification doc would have been a required
field added to a live collection — a converter tightening needing a
`pre-deploy` backfill across three environments, bought nothing, and would drift
from the type the moment someone edited one and not the other.

Same reasoning for preferences: `users/{uid}/preferences/notifications` is an
**optional** doc. Absent means `DEFAULT_NOTIFICATION_PREFS` (everything on).
That is not a retrocompat shim — the doc genuinely does not exist until a user
changes something, so there is no stale data to backfill and no converter that
can crash on an old account.

### Android and iOS each get their native transport

**The platform decides the transport.** `expo-notifications` returns an **FCM
registration token on Android but a raw APNs device token on iOS**, and FCM
cannot deliver to a raw APNs token. A single FCM path would have worked on
Android and silently never delivered on iOS. So:

| | Android | iOS |
|---|---|---|
| Token | FCM registration token | raw APNs device token |
| Transport | FCM HTTP v1 via `firebase-admin` | APNs HTTP/2 directly, token auth (`.p8`) |
| Native config | `google-services.json` | none — no `GoogleService-Info.plist` needed |
| User-facing mute | one **notification channel per category** (`mine`/`village`/`social`) | the in-app toggle only (no channel equivalent) |
| Urgency | `priority: 'high'` for `mine`, else `'normal'` | `interruption-level: 'time-sensitive'` + `apns-priority: 10` for `mine`, else `active` / `5` |
| Repeat suppression | `collapseKey` | `apns-collapse-id` (same string, truncated to 64 bytes) |
| Grouping | `notification.tag` | `thread-id` (same string) |
| Badge | launcher-managed | `aps.badge` = the Buzón's unread count |

Rejected alternatives:

- **`@react-native-firebase/messaging`** for FCM tokens on both platforms: a
  second push library whose Android messaging service competes with
  expo-notifications' for the same intents, plus static iOS frameworks.
- **Expo's push relay**: uniform, but it adds a US third-party processor for a
  Spanish app's notification content, loses collapse/thread control, and needs
  a second receipts-polling job to find dead tokens.

The platform split lives in exactly one place:
[PushEnvelope.ts](../../../packages/shared/src/models/notification/PushEnvelope.ts)
builds a platform-neutral envelope, then `toFcmAndroidMessage` /
`toApnsNotification` map it to each wire format. Both are typed structurally and
tested in the fast vitest suite; the FCM shape's assignability to firebase-admin's
`MulticastMessage` is checked at compile time at the send site. Channel ids ARE
the category ids, so the server's `channelId` and the client's
`setNotificationChannelAsync` cannot drift (a test asserts it).

Two iOS details that fail silently if wrong:

- **The APNs environment travels with the token** (`apnsEnvironment` on the
  device doc), read on the client from the binary's provisioning-profile
  entitlement via `expo-application` — never from JS config, because an OTA
  bundle built by `eas update` knows nothing about the binary it runs in.
  Sending a sandbox token to production APNs answers `BadDeviceToken`,
  indistinguishable from a dead token.
- **`time-sensitive` needs the
  `com.apple.developer.usernotifications.time-sensitive` entitlement**; without
  it iOS silently downgrades to `active`. It is **not declared yet**: the ASC API
  cannot enable the capability, so it waits on the Account Holder (see
  `app.config.ts`).

### Quiet hours, for broadcast only

A `pushQueue/{uid}__{notifId}` doc is created for every push, idempotently
(create-if-absent). This does double duty: it is the **at-least-once guard**
Eventarc requires, and the deferral mechanism. `mine` sends immediately;
`village` and `social` created between 22:00 and 08:00 Europe/Madrid get
`sendAfter` = the next 08:00 and are flushed by `flushPushQueue`.

A 03:00 "nuevo evento en Matabuena" is how a village app gets uninstalled. A
23:00 "se ha liberado tu plaza" is useful. Hence the split by category rather
than a global switch.

### Everything added to a village notifies it

One type, `village_entity_published`, carrying `entityKind` — not six
near-identical types. The set is the entity family from AGENTS.md: **event,
news, place, barrio, organization, festivalPoster, historyEntry**.

The subtlety is that "added to the village" is a different moment per kind:

| Kind | Fires on |
|---|---|
| event | create, `status: 'published'` |
| news, place, barrio, festivalPoster, historyEntry | create, `status: 'active'` (not hidden) |
| organization | **update** `pending → approved` — creation is a *request*, not a village-visible thing |

Fan-out reads `municipalities/{id}/members` and writes one notification doc per
member, excluding the actor, via BulkWriter with a deterministic id
(`village_entity_${kind}_${entityId}`). Push then happens through the same
`onNotificationCreated` path as everything else.

FCM **topics** per municipality were rejected: a topic cannot respect
per-category preferences, quiet hours, or a block list, and cannot be
unsubscribed server-side. At village scale (hundreds of members) the read cost
of token fan-out is not the constraint.

### Permission is asked at an earned moment, never at launch

iOS grants exactly one OS dialog, ever; a denial is only recoverable through a
trip to Settings. So the OS dialog is **always** preceded by an in-app sheet
explaining a concrete promise, and is only reached if the user says yes there.

- **Primary trigger:** the first successful event sign-up — highest intent, and
  the promise is specific and true ("te avisamos si se libera una plaza o si
  cambia algo").
- **Fallback:** joining a village, if never asked.
- **Capped at 2 soft asks, ever**, tracked in AsyncStorage.
- A permanent `Ajustes → Notificaciones` row is the recovery path, deep-linking
  to OS settings when permission is denied.

## Out of scope (deliberate)

- **Web push.** Web's job is the anonymous reader (AGENTS.md invariant 6);
  browser push needs a service worker fighting `output: 'single'`, and iOS
  Safari requires an installed PWA. App-only, with no wall on web.
- **Deleting the dead `organizer_request_created` enum value.** It was dropped
  as a producer by the unified-inbox change but pre-existing prod docs may carry
  it, so removing it from the schema is a converter tightening that would block
  a promotion at the conformance gate. It needs its own `pre-deploy` backfill —
  a separate change, on a hard-stop path.
- **Phase 2 types:** `comment_on_my_entity`, `org_member_joined`, and a
  digest/rollup for villages that publish many entities at once.

## Platform prerequisites, and what each one cost to learn

Current state lives in *Status* above; these are the durable facts, each of
which failed once before it was understood.

1. **A bound secret that does not exist fails the WHOLE `firebase deploy`,**
   every unrelated function included. `APNS_AUTH_KEY` is bound by
   `onNotificationCreated` and `flushPushQueue`, so it must exist in an env
   before code that binds it deploys there. Dev deploys were red for three days
   (2026-09-11 -> 09-14) on exactly this. A `{}` placeholder is enough to
   unblock: `sendApns` logs a warning and skips iOS rather than crashing. Value
   shape: `{"keyId":"ABC123DEFG","privateKey":"-----BEGIN PRIVATE KEY-----\n..."}`.
   The Team ID is not secret and lives in `apnsTransport.ts`.
2. **CI's non-interactive `eas build` never syncs Apple capabilities** — the
   opposite of what this plan originally assumed. The first build carrying
   `expo-notifications` failed because bundle id `com.cultuvilla.app` lacked
   *Push Notifications*, and eas-cli's capability PATCH is rejected outright
   (`invalid value at data.relationships.bundleIdCapabilities`) even on 24.3.0.
   What worked: `POST /v1/bundleIdCapabilities` with the ASC key
   (`PUSH_NOTIFICATIONS`, 201). **`time-sensitive` is not in the public
   `capabilityType` enum** — it is portal-only, hence Account-Holder-only, which
   is why its entitlement is commented out in `app.config.ts` rather than
   shipped. Repairing the then-INVALID provisioning profile needed one local
   interactive `eas build` with `EXPO_NO_CAPABILITY_SYNC=1`.
3. **`google-services.json` is what mints the Android FCM token,** and a wrong
   or missing file fails silently — the build succeeds and no device ever
   registers. Committed per env, locked by `googleServices.test.ts`; a new store
   identity (as beta became) needs its own file, not a copy of another env's.
4. **Push never reaches installed apps over OTA.** `expo-notifications` moves
   the native fingerprint, so it ships in a store binary or not at all.

Push is app-only: the web is a server-rendered read site with no accounts — see
[web-is-a-read-site.md](../../decisions/web-is-a-read-site.md).

## Follow-ups

- **A `pushQueue` retention policy.** Entries are never deleted after sending
  (~1,400 as of 2026-09-29). A Firestore TTL policy on `sentAt` clears them
  without code; nothing reads a sent entry.
- **An Android status-bar icon.** Android renders the small icon as a white
  silhouette; without a dedicated monochrome asset some devices show a grey
  square. Add `icon` to the expo-notifications plugin once one is designed.
- **Delete `organizer_request_created`** with its own `pre-deploy` backfill
  (see Out of scope).
- Phase 2 types (see Out of scope).

## Revisit when

- Open rates show `village` broadcast is noisy in a large municipality → add a
  daily rollup instead of one push per entity.
- Token fan-out reads become measurable → reconsider topics for the broadcast
  category only, accepting the loss of per-user filtering.
