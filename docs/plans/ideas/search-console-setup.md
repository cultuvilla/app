# Search Console for the read site

**Priority:** low

**Goal:** Google indexes the read site's public pages, and we can see how they do in search.

## Context

The read site serves every public route on prod (verified 2026-10-08 when the
app-only transition plan retired; see
[web-is-a-read-site.md](../../decisions/web-is-a-read-site.md)). Nothing tells
Google about it yet, and nothing reports how its pages index.

## Design / approach

All of it is console work on accounts the user holds:

1. Add a Search Console property for `cultuvilla.es` (domain property, DNS TXT verification).
2. Submit `https://cultuvilla.es/sitemap.xml`.
3. Run one Rich Results Test on an event page (`/<pueblo>/evento/<titulo>_<id>`) to check its JSON-LD.
4. Paste one event link into WhatsApp and check the preview card. The OG tags are verified by `curl`; this checks how the card actually renders.
5. Check coverage 2–4 weeks later.

## Open questions

- Which Google account owns the property: `cultuvilla.app@gmail.com`, like the rest of the prod tooling?
