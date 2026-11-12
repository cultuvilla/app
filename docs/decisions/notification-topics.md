# Notification topics: one switch per kind of notification

Decided 2026-11-12 (Álvaro: "make it the best option long term"). Shipped with
the per-topic settings screen (Ajustes → Notificaciones).

## What

`NotificationTopic` ([NotificationTopic.ts](../../packages/shared/src/models/notification/NotificationTopic.ts))
is the one taxonomy of notifications as a villager perceives them, in five
sections: *Tus eventos*, *Tu pueblo*, *Tus grupos*, *Cosateca*, *Comunidad*.
Each topic is one switch. A person can also mute one pueblo's *Tu pueblo*
topics (only shown with 2+ pueblos), and the per-group avisos/chat switches
stay in each group's settings, linked from the screen.

The coarse `NotificationCategory` (`mine` / `village` / `social` / `groups`)
stays underneath for what the OS needs — the Android channel and the
quiet-hours bypass. The topic is what a person mutes.

## Why it is shaped this way

- **The topic is derived, not stored, wherever the type says enough.** Only
  `group_task` carries a stamped `topic`: that one type covers tasks, shifts,
  their comments, the whole cosateca and its reservas, because a new
  `NotificationType` makes an installed binary's strict converter throw. Its
  producers stamp the topic; a doc without one (or with a topic this build
  does not know) reads as `group_tasks`.
- **`topic` and `mutedTopics` are plain strings, not enums**, so adding a
  topic never makes an older converter throw.
- **The switches live in their own doc**, `users/{uid}/notificationSettings/account`,
  not as new fields on `users/{uid}/preferences/notifications`. Installed
  binaries write that old doc with a full `setDoc`, which would wipe any field
  added there. Its own collection also keeps the conformance gate reading each
  with its own schema (rules admit exactly one doc in each).
- **Expand → migrate → contract.** Until `minSupported` passes the first binary
  with this screen, the server honours both docs: a push goes out only if
  neither mutes it (`resolveNotificationSettings`). The new screen reads the
  old coarse mutes folded into topics, and every save writes the old doc back
  all-on with `quietHours` in step — so a device still on an older app shows
  the same night choice, and an old mute is carried over the first time the
  person touches a switch. The contract step is
  [retire-coarse-notification-prefs](../plans/ideas/retire-coarse-notification-prefs.md).
- **Only switches that can fire are shown.** *Tus grupos* needs a group;
  *Solicitudes que gestionas* needs a pueblo, group or app admin role.
- **Turning off a *Tus eventos* switch asks first** — it is what happens to the
  person's own seats and events, unlike the pueblo's news.
- **Push only.** The Buzón keeps everything; emails (aviso channel picked by the
  junta, cuota reminders) are not governed here.
- **Android keeps four channels.** Twenty-two entries in the OS settings would
  be clutter; the in-app screen is the granular surface.
