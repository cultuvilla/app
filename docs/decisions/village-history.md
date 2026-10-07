# Village history timeline

**Status:** shipped (2026-09). Code: `packages/shared/src/models/history/`,
`historyService`, `apps/mobile/app/village/[villageId]/history*`.

Each pueblo has a **Historia** timeline: dated entries with a title, an
article-style body, up to three captioned images and optional sources. This
records the choices that are not obvious from the code.

## Dates are integers, not Timestamps

A historical date is `{ year, month | null, day | null }`, with an optional
`end` for a range and an `approximate` flag rendered as "h.".

- **A Timestamp cannot hold a year before 0001**, and a village's history
  often starts with a Roman or Celtiberian settlement. Negative years are BC;
  there is no year 0, which the schema and the rules both reject.
- **A Timestamp claims a precision nobody recorded.** "1500" stored as
  1 January 1500 would print, sort and filter as if the day were known.
- **Formatting is hand-built** (`utils/historyDates.ts`), not `formatDate`: a
  JS `Date` maps years 0–99 onto the 1900s and Intl prints BC years as
  negatives.
- **No century precision.** "Siglo XII" is a circa range 1101–1200. It keeps
  the model to three optional parts and one sort key.

`sortKey = year*10000 + month*100 + day` is monotonic for BC years too. It is
the timeline's only order field, and **`firestore.rules` re-derives it**, so
a client cannot file an entry at a date it does not claim.

## Open posture, like vocabulary

Members publish instantly, anyone reads, admins moderate after the fact through
`setContentVisibility`. There is no approval queue: a list that has to be
approved is a list that does not fill up (the same reasoning as vocabulary and
the occupation taxonomy).

Unlike a vocabulary definition, an entry is a shared account of an event, not
one villager's opinion, so **village admins may also edit it**, not only hide
it. `municipalityId` and `createdBy` are immutable: authority reads the stored
doc, and a mutable `municipalityId` would let an admin of one pueblo walk an
entry into another.

## Images live in the gallery, not the body

The body is a single formatted text run that reuses news' mention, link and mark
spans, **without inline image blocks**. Images live only in the capped gallery,
so the three-image limit actually holds, and each image carries a caption,
because old photos nearly always need a credit.

## Timeline layout

Vertical, with the present at the top, so scrolling down goes further into the
past. Entries are **evenly spaced** with a divider opening each century.
Spacing proportional to time would be mostly empty scroll: a pueblo's recorded
history bunches into the last hundred years, with long silences before that.

## History entries are separate from news

News already has a `historia` category. A news post is dated by when it was
**published**; a history entry is dated by when the thing **happened**. Folding
one into the other would give the feed a meaning for dates that the timeline
cannot share, so the two stay separate.

## Deferred

- `@`-mentioning a history entry from news (`MENTION_ENTITY_TYPES`).
- Sitemap entries. (Share previews exist since 2026-10-02: the read site
  renders `/<pueblo>/acontecimiento/<ref>` with its own OG tags.)
