# Group chat — a conversation under each aviso, and one for the whole group

**Priority:** high
**Landed:** dev
**Gate:** none
**Next:** promote it with the next release (checked on an Android emulator against dev on 2026-11-01: both chats, badge, opt-in, report, block, delete from Denuncias)

Decided 2026-11-01 (user): "each alert should have a chat where people can talk, and
there should be a general chat in the group." The direction behind it: the app is the
group's communication platform; email and WhatsApp are bridges into it, not channels to
perfect (no WhatsApp Business API, no sending as the group's Gmail).

## Why

Mis grupos can send an aviso to every socio (push, email, `wa.me` links — see
[group-toolkit.md](group-toolkit.md) Phase 4), but nobody can answer it in the
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

## Decisions

Decided 2026-11-01 (user): all five agent picks below.

1. **Who sees whose name.** `sociosListVisible` (default off) hides the roster from
   members; a chat shows every author's name to everyone who reads it. *writing in
   a chat shows your name to that chat's readers — a socio who writes chooses to be
   seen; the roster setting keeps governing the list, not the chat.*
2. **Who may write in the general chat.** *every member; a per-group setting
   "solo la junta escribe" (announcement-only) for groups that want it.*
3. **Notifications.** Replaced — see below.
4. **Moderation.** *authors delete their own messages; org admins delete anyone's
   (and village/app admins as the backstop, as for members); no editing at first.*
5. **History.** *kept while the group exists; a member who leaves loses read
   access; their messages stay, under the name they had.*

Decided 2026-11-01 (user), replacing decision 3: "chat messages should not notify, we can
add an option so you can activate the notifications, but in principle you don't get
notifications." In general and aviso chats alike, with no exception for the aviso's author
or earlier writers, nothing notifies by default. One per-member, per-group toggle covers both
kinds of chat, off by default; an opted-in member gets a normal notification per message and
the group mute still wins. The unread badge on the group's tiles stays for everyone.

Decided 2026-11-01 (user): report and block go with the screens (App Store guideline 1.2): a
report action on chat messages and hiding messages from blocked users. The report includes the
reported message's text, so village and app admins see what was reported without getting access
to the chat. Chat messages are hard-deleted when an account is deleted, and stay when someone
only leaves a group.

## As built

- **Layout:** `organizations/{orgId}/chat/{id}` (general), `organizations/{orgId}/messages/{id}/chat/{id}`
  (aviso), `organizations/{orgId}/chatThreads/{threadId}` (function-owned `lastMessageAt`,
  `lastAuthorUid`) and its `reads/{uid}` (the reader's last open). A thread id is the aviso's or
  `general`.
- **Names:** stored on each message; the rules require the writer's `publicProfiles` name.
- **Push:** no new notification type, since an old binary's strict converter would throw on one
  and blank its Buzón. Chat pushes are `group_message`, keyed `group_chat_<threadId>_<chatId>`,
  with `chatThreadId` to open the thread (an old binary drops the field and opens the avisos).
  The trigger finds the opted-in by a collection-group query on `groupPrefs` (`orgId` + `chatPush`),
  then keeps those who may still read the thread.
- **Unread:** `useGroupChatUnread`, per thread: the summary against the reader's last open.
- **Screens:** the Charla is the `charla` section; an aviso's thread is
  `/grupos/<orgId>/aviso/<id>`, opened from its notice, the admins' detail sheet and a push.
- **Aviso links:** WhatsApp and email carry `/grupos?grupo=<orgId>&aviso=<id>`, not the route:
  a binary with no aviso route still opens the group from it.
- **Reports:** `targetKind: 'comment'` with the message's path as `targetId` and its words in
  `targetText`. A new enum value would throw in an installed admin binary's strict report
  converter and take down its whole Denuncias list. The reporter supplies the text; nothing checks
  it against the message.

## Left for later

Photos, reactions, replies to a message and mentions (*What*). A Maestro flow for the chat
(unit-tested, see `e2e/native/uncovered.json`). A deleted message does not move the thread's
summary back, so a badge may show until the thread is opened. A deleted message's Buzón entry
keeps its text for whoever opted in to notifications.

`KeyboardAvoider` under-pads on edge-to-edge Android for every screen, by the status bar plus the
navigation bar. Raising its `keyboardVerticalOffset` is not the fix: the offset also applies on
`keyboardDidHide` and leaves a gap once the keyboard closes. A chat works around it locally
(`useComposerKeyboardGap`); forms hide it by scrolling their field in.
