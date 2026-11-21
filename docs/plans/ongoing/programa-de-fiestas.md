# Programa de fiestas — one link for the fiestas, before and after

**Priority:** medium — the fiestas are the season Cultuvilla is built around, and today they have a poster and a summary but no programme
**Landed:** dev
**Gate:** soak:the first release carrying #732 is live in prod
**Next:** QA pass on docs/qa/pending/programa-de-fiestas.md, then retire into docs/decisions/ and pick the follow-ups (push, Wrapped reminder from edition dates, event-detail label)

Decided 2026-11-21 (user): yes — editions plus a tagged-event programme at the existing fiestas URL, push left for later (the recommended answer).

**Goal:** a fiesta block gets that year's dates and its events grouped into a day-by-day
*programa* that people forward before and during the fiestas, at the one link that
turns into the Wrapped afterwards. That gives the Wrapped its dates without an admin
having to pick them.

## Context

As of `e6f84572` (2026-11-21):

- **The fiestas exist in three places, and none of them is the programme.**
  `community.fiestas` (`FiestaBlockModel.ts`) is a name and a month per block, and its
  doc comment says why: "the exact days move every year… The exact dates of one year are
  chosen when that year's Wrapped is created". A cartel (`festivalPosters/`) is the
  poster, and [carteles-de-fiestas.md](../../decisions/carteles-de-fiestas.md) rejects
  "cartel as an event container… a cartel is a poster image + metadata, a visual
  archive, not a programme". The Wrapped (`villageWrapped/{municipalityId}_{year}`)
  is the summary afterwards, so it only exists once the fiestas are over.
- **So the dates get entered once, too late.** The Wrapped reminder goes to the admins
  the month after the last fiesta (`wrappedReminderYear`), or the village home invites
  them once there has been movement (`fiestaMovement`, two days after the last event, per
  [village-fiestas-wrapped](../../decisions/village-fiestas-wrapped.md)), and an admin then
  picks each block's days (`WrappedBlockSchema.start/end`, via `buildVillageWrapped`) for
  events that already ran. The village
  had those dates weeks earlier, when it put the programme on the cartel.
- **Events have no idea they belong to the fiestas.** `EventDataModel` has
  `repeatsYearly` ("A yearly event (las fiestas)") but no link to a block, so a fiesta
  week is twenty loose cards in Explora and on the village home, mixed with the rest
  of the summer. The Wrapped counts them by date range, not by membership.
- **People write the programme as a news post.** The news composer test uses "El
  programa de fiestas ya está aquí." as its sample text
  (`apps/mobile/app/crear/__tests__/noticia.test.tsx`), and that is what villages do:
  a photo of the printed programme, not linked to the events people sign up for.
- **The comisión plan left this open.** [comision-de-festejos-type.md](../ongoing/comision-de-festejos-type.md)
  names "link to fiestas/cartel/programa" among the comisión-specific features, "a later
  plan, to be picked with the user". This is that plan's centre, open to any group, not
  just the comisión.
- **The link already exists.** `/<pueblo>/fiestas/<año>` (`WRAPPED_SEGMENT` in
  `packages/shared/src/utils/urls.ts`, the read-site route in `functions/src/web/routes.ts`,
  `apps/mobile/app/[pueblo]/fiestas/[year].tsx`) is routed for any year, but shows
  something only once a Wrapped is published: until then the read site answers 404
  (`handler.ts`, `case 'wrapped'` via `loadWrapped`) and the app its empty "missing"
  state. For the eleven months before that, there is nothing at the link to forward.
- **Villages stall without a reason to share.** [village-first-steps.md](village-first-steps.md)
  records 20 of 21 active villages stuck at their starter (prod, 2026-09-29), and the
  thing that worked in Matabuena was a real person bringing the peñas *for the
  fiestas*. A programme is the one thing a whole village forwards every summer.

## Design

**One edition per block per year.** A *fiesta edition* is a block's days for one year:
`{ municipalityId, blockId, year, startDay, endDay }`, with days resolved in Madrid
through `madridDayRange` (illustrative shape, not decided). Village members propose it
and admins (or the comisión's admins) correct it, the same moderation as carteles.
The cartel for that year can be attached to it.

**Events join an edition.** An event gets an optional `fiestaEditionId`, set from the
event form when its date falls inside an edition's days ("Forma parte de las fiestas
de Santiago 2026"), defaulted on when it does. With the Wrapped's date-range counting,
an event in that range is counted even if nobody tagged it, so tagging only makes the
programme tidier.

**The programme is a read, not a document.** The edition's events, grouped by Madrid
day and ordered by start time (the order the read site already shares with the app
under [read-site-shared-list-rules](../ongoing/read-site-shared-list-rules.md)):

- **App:** `/<pueblo>/fiestas/<año>` shows the programme while the edition is upcoming
  or running ("Hoy" first while it runs) and the Wrapped story once one is published,
  with the programme a tap away. The village home shows the upcoming edition near the
  top in the weeks before it.
- **Read site:** the same URL server-renders the programme for the anonymous WhatsApp
  reader, with an OG preview built from the cartel. It is a read page with app
  calls to action, no flow (invariant 6).
- **Wrapped:** `buildVillageWrapped` takes its blocks' days from the editions when they
  exist, so the admin confirms instead of picking. The reminder and the `fiestaMovement`
  invite can then key off the edition's last day instead of the block's month or a gap
  in activity. A draft Wrapped must still answer as if it did not exist (the decision's
  rule), so the page keeps showing the programme until the Wrapped is published.

Push ("Mañana empiezan las fiestas", "Hoy: …") reuses the existing topic machinery and
is a follow-up, not part of the first version.

**Alternatives considered:**
- *Dates on the block itself:* rejected by `FiestaBlockModel`'s own reasoning, since the
  days change every year.
- *The programme as a rich news post or a cartel field:* that is what villages do today,
  and it cannot list the events people sign up for. The carteles decision rules it out.
- *One parent "fiestas" event with sub-events:* this changes every event read, the feed
  and the strict converter for one season's grouping, and the edition gives the same
  grouping with an optional field.

**Testing strategy:** pure grouping (edition + events → days) and the "is this edition
upcoming / running / over" rule in `packages/shared/test/`; rules tests for the edition's
create/moderate and the event field; a read-site route test for the programme state of
`/<pueblo>/fiestas/<año>`; the Wrapped build test gains "dates come from the edition".

## Paths

As of 2026-11-21:

- `packages/shared/src/models/municipality/FiestaBlockModel.ts`, `packages/shared/src/models/fiesta/` (new): edition model
- `packages/shared/src/models/event/EventDataModel.ts`: `fiestaEditionId`, plus a backfill to `null`
- `packages/shared/src/services/` (new `fiestaEditionService`), `_services-map.md`
- `firestore.rules`, `firestore.indexes.json`, rules tests
- `apps/mobile/app/[pueblo]/fiestas/`, `apps/mobile/app/crear/evento.tsx` (or its form-state module once [event-form-state-module](../ongoing/event-form-state-module.md) lands), `apps/mobile/components/feature/VillageHomeBody.tsx`
- `functions/src/web/` (programme page, OG), `functions/src/wrapped/` (dates from editions)
- `packages/i18n/messages/es.json`
- `docs/decisions/` (record once shipped), `docs/qa/pending/`

## Approval

Approved by the user on 2026-11-21 (above). It changes what users see and adds a stored collection and a field on
`events` (*Approval*: "anything a user can see or do differently"). The `Gate` question;
recommended answer: **yes, editions plus a tagged-event programme at the existing fiestas
URL, with push left for later**. The fiestas are the moment a whole village forwards one
thing, and the link and the date logic are already built for the Wrapped.

## Out of scope

- Push for the programme (follow-up, on the existing notification topics).
- Comisión-only features (mandate handover, derrama, patrocinadores, lotería).
- A cross-village "fiestas de la comarca" calendar. Editions make one possible later.
- Printing or exporting the programme as a PDF.
