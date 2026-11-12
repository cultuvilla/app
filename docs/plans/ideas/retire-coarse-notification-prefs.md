# Retire the coarse notification preferences doc

**Priority:** low — cleanup once older binaries are walled off
**Gate:** soak:`minSupported` reaches the first release carrying the per-topic notification settings

The contract step of [notification-topics](../../decisions/notification-topics.md).
Once no supported binary reads or writes `users/{uid}/preferences/notifications`:

- Backfill: fold any `false` coarse switch into `notificationSettings/account`
  `mutedTopics` (same mapping as `resolveNotificationSettings`), creating the doc
  where missing.
- Stop reading the old doc in `onNotificationCreated` and `watchNotificationSettings`,
  stop writing it in `saveNotificationSettings`, and delete `NotificationPrefsData`,
  its converters, refs, rule, conformance entry and `TOPIC_LEGACY_CATEGORY`.
- Delete the stored docs (and their `deleteAccount` line).
- `Breaking-Client:` on the commit that drops the rule, since older binaries write it.
