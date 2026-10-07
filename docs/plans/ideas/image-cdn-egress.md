# Image delivery through a CDN

**Priority:** low
**Next:** set a GCP budget alert on `cultuvilla-prod` so storage/egress growth is noticed before it is billed

## Goal

Keep image download cost and latency flat as Cultuvilla grows from one village
to hundreds, by serving Storage images through a caching CDN instead of straight
from the Firebase Storage download endpoint.

## Context

Measured on prod on 2026-09-14:

- The whole bucket is **345 MB**; Matabuena alone is **254 MB**, of which
  ~238 MB is originals (legacy uploads from before the 1600px client downscale,
  1–1.6 MB each) and only ~15 MB the `_card` / `_thumb` variants.
- A current upload costs ~526 KB stored per photo: original 372 KB, `_card`
  144 KB, `_thumb` 10 KB. Readers load `_card` (see `RemoteImage`).

Storage is a cumulative cost (villages × years) but stays small: at ~1 GB per
village per year and ~$0.02/GB-month, 1,000 villages is ~$20/month after a year.
**Egress is the cost that scales with readers** and is paid again every month:
1,000 villages × 300 active readers × ~100 card images a month is ~4 TB/month,
on the order of $500/month at Storage's internet egress rate — roughly 25× the
storage bill at the same point. Every Firebase Storage fetch is billed egress;
the download endpoint is not CDN-cached, so `Cache-Control: immutable` only helps
a device that already has the image.

(Prices are list prices, not verified against the billing account — confirm in
the GCP pricing calculator before acting on the numbers.)

## Options

1. **Cloud CDN in front of the bucket** — an external HTTPS load balancer with a
   backend bucket. Cheapest egress at volume and edge-cached, but a load balancer
   has a fixed monthly cost (~$18) that only pays off past some traffic level,
   and backend buckets serve objects publicly: token-gated or rules-gated images
   (person photos) must stay on the download endpoint.
2. **Firebase Hosting rewrite / proxy function** — reuses the existing Hosting
   CDN, no load balancer. A function in the hot path adds invocation cost and
   cold starts, so it only makes sense if Hosting can cache the response at the
   edge (`Cache-Control: public, s-maxage`).
3. **Stay on the download endpoint** until egress shows up on the bill, with a
   budget alert as the trigger to revisit.

## Open questions

- Which images are public-by-design (news, events, places, barrios, orgs,
  posters, history) versus auth-gated (person/user photos)? Only the former can
  move behind a public CDN.
- `variantImageURL` rewrites Firebase download URLs; a CDN host means a second
  URL shape in that helper (and in `ogRenderer`'s image handling).
- At what monthly egress does option 1's fixed cost break even?

## First step regardless of option

Set a GCP budget alert on `cultuvilla-prod` so storage/egress growth is noticed
before it is billed, not after.
