# Village fiestas Wrapped

A village's post-fiestas summary: seven 1080×1920 story cards rendered on the
server, published by its admins, and read and shared by everyone as a story at
`/<pueblo>/fiestas/<año>`. The code is the source of truth for what exists; this
records why it is shaped this way.

## The Wrapped is images, rendered on the server

Images are what people forward, and a forwarded image needs a URL for a link
preview to resolve, which rules out rendering on the device. One render (Satori
for layout with fonts embedded as glyph paths, then sharp) serves the app, the
share preview and the notification identically on every phone. Photo cards ship
as JPEG and flat cards as PNG. `pnpm wrapped:preview` renders a real village to
local files with the deploy's own esbuild options, so iterating on the design
needs no deploy.

## One doc per village per year, built from dates an admin picks

`villageWrapped/{municipalityId}_{year}` covers every fiesta block of the year.
A village profile only knows each block's name and month, so the scheduler
cannot build a Wrapped. It reminds the admins the month after the last fiesta
(December's reminder arrives in January and names last year), and an admin
picks the days. The deterministic id makes a rebuild overwrite in place.

## Notify first, publish anyway

A build is a `draft` that publishes itself `AUTO_PUBLISH_GRACE_DAYS` later unless
an admin publishes or discards it first. There are only two actions, and no
editor: the numbers are the numbers. A thin Wrapped (below `meetsAutoPublishFloor`)
never publishes on the timer. Auto-publishing one event and two sign-ups makes
the pueblo look dead on its own noticeboard, so only an admin can choose to show
it. `autoPublishAt` is a stored timestamp rather than elapsed-time arithmetic, so
a missed run delays publication instead of skipping it.

## Counting rules found in real data

- **Sign-ups, never attendance.** `checkedInAt` is unused, so the copy says
  *se apuntaron*.
- **Unique personas, not registrations.** Families sign up several personas, so
  summing registrations inflates participation by about 50%.
- **Cancelled events are filtered out.** Organizers cancel and recreate events,
  so the cancelled copies are not duplicates to clean up.
- **The censo figure is kept apart from the participation figure.** People with
  no village link took part but are not in the censo, so the two numbers are
  never read against each other.
- **Only `isPublic` people and `active` carteles are drawn**, because every card
  can be forwarded.

## Reading and sharing

- **The public link is `/<pueblo>/fiestas/<año>`.** It opens a story on web and
  in the app, signed in or not. The link-preview server shows the cover card.
- **A draft answers as if it did not exist.** The preview server returns 404 and
  `getReadableWrapped` returns null, so the link never looks published before
  it is. This holds even for the admin who owns the draft; admins preview a
  draft from `/<pueblo>/resumen` in the same viewer, with sharing turned off.
- **The story viewer uses core RN only.** It does not depend on gesture-handler
  or reanimated, because a viewer that needs a new store binary reaches nobody
  until that binary ships, and OTA cannot carry native code.
- **A card is shared as a file through the system share sheet.** That sheet is
  where WhatsApp status, Instagram stories and "Guardar imagen" already are. A
  direct Instagram Stories integration would need a native module and a Facebook
  App ID. Sharing a card is app-only, per
  [web-is-a-read-site.md](web-is-a-read-site.md); web reads.
- **Every card prints its own address** (`cultuvilla.es/<pueblo>/fiestas/<año>`).
  A card shared as a picture carries no link, so it needs its own way back.
- **Every village member is notified once when the Wrapped publishes**, whether
  by an admin or by the timer. The notification is written with `create()` under
  a deterministic id, so the hourly job cannot repeat it. The Wrapped belongs to
  the pueblo, and publication is when it is most worth forwarding.
- **The village home shows a banner for `WRAPPED_FRESH_DAYS` (60).** The window
  starts at the end of the fiestas or the build, whichever came later. There is
  no `publishedAt`, and the grace period is noise against a two-month window.

## Revisit when

- Personal cards land (the events you and your personas signed up for), which
  is the next layer.
- A Wrapped's images are regenerated after its link has been shared. Every
  upload mints a new download token, which breaks any raw image URL forwarded
  before. Today nothing in the product hands out a raw image URL: links point
  to the page, and cards are shared as files.
