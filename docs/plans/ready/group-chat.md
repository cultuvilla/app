# Group chat — a conversation under each aviso, and one for the whole group

**Priority:** high

Decided 2026-11-01 (user): "each alert should have a chat where people can talk, and
there should be a general chat in the group." The direction behind it: the app is the
group's communication platform; email and WhatsApp are bridges into it, not channels to
perfect (no WhatsApp Business API, no sending as the group's Gmail).

## Why

Mis grupos can send an aviso to every socio (push, email, `wa.me` links — see
[group-toolkit.md](../ongoing/group-toolkit.md) Phase 4), but nobody can answer it in the
app. A reply to the email lands in an inbox, a reply to the WhatsApp in the admin's
private chat, and the group's actual conversation stays in its WhatsApp group. The first
user, Asociación La Anduela (~200 socios), wants the group to talk where it is organised.

## What

- **A chat under each aviso.** Opening an aviso shows its messages below it; any
  recipient of the aviso can write. The aviso is the first message of its thread.
- **One general chat per group** ("Charla"), for everything that is not an aviso. Any
  member can write.
- Plain text first. Photos, reactions, replies-to-a-message and mentions are later.
- Members without the app are not in the chat. Emails and WhatsApp texts already link
  into the app; that link is how they join the conversation.

## What exists to build on

- **Avisos** are `organizations/{orgId}/messages/{messageId}`, with `recipientUids`,
  `reads/` and `votes/` subcollections; members read an aviso only if their uid is a
  recipient (firestore.rules, `messages` block). #604 removes pinning and simplifies the
  list — start from what it leaves.
- **Comments** (`comments/`, `commentsService.ts`, `EntityComments`) are **public**
  (`allow read: if true`) and village-scoped — the wrong shape for a private group chat.
  Reuse the UI ideas, not the collection.
- **Push** goes through `users/{uid}/notifications` + `onNotificationCreated`, with the
  `groups` category ("Mis grupos" Android channel) and per-group mute in
  `users/{uid}/groupPrefs/{orgId}`.
- Live reads: `watch*` service functions + `useWatch`, painted from Firestore's
  persistent cache (AGENTS.md *State and data fetching*) — a chat is exactly that shape.

## Open decisions (agent's picks, to confirm with the user)

1. **Who sees whose name.** `sociosListVisible` (default off) hides the roster from
   members; a chat shows every author's name to everyone who reads it. *Pick: writing in
   a chat shows your name to that chat's readers — a socio who writes chooses to be
   seen; the roster setting keeps governing the list, not the chat.*
2. **Who may write in the general chat.** *Pick: every member; a per-group setting
   "solo la junta escribe" (announcement-only) for groups that want it.*
3. **Notifications.** A busy chat must not ring 200 phones per message. *Pick: aviso
   chats push only the aviso's author and people who already wrote in that thread; the
   general chat pushes nobody by default, with a per-group opt-in; an unread badge on the
   group either way.*
4. **Moderation.** *Pick: authors delete their own messages; org admins delete anyone's
   (and village/app admins as the backstop, as for members); no editing at first.*
5. **History.** *Pick: kept while the group exists; a member who leaves loses read
   access; their messages stay, under the name they had.*

## Left to the builder

Collection layout (e.g. `messages/{id}/chat/{msgId}` and `organizations/{orgId}/chat/{msgId}`),
rules + rules tests, the service and its `watch*`, pagination, the unread counter, the
notification trigger, screens and i18n — against the code of the day.
