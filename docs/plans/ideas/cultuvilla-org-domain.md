# Register cultuvilla.org

**Priority:** medium
**Gate:** decision:register cultuvilla.org now in the founder's personal name, or wait for the asociación's CIF?
**Next:** find which registrar and account hold cultuvilla.es, then buy .org (and decide on .com in the same sitting)

## Goal

Own `cultuvilla.org` before someone else does, and decide **in whose name** it is
registered — which is the only part of this that is hard to undo.

## Context

`cultuvilla.org` is **free as of 2026-09-23** (whois: *Domain not found*).
`cultuvilla.com` is free too.

`cultuvilla.es` is the live production domain and is deeply embedded: Firebase
Hosting serves it, the download QR encodes `https://cultuvilla.es/descarga`
([qr-descarga](../../decisions/qr-descarga.md)), the
`apple-app-site-association` and the sitemap are served from it, the store
listings point at it, and Search Console history lives there. **This plan is not
a migration.** `.es` stays canonical.

Two things make now the moment rather than later:

- **Cultuvilla is about to become an asociación sin ánimo de lucro** — decided
  2026-09-14, constitution planned for the end of September 2026
  ([entidad-juridica](https://github.com/cultuvilla/business/blob/main/docs/entidad-juridica.md), in the private business repo). In the third sector a `.org` reads
  as an entity rather than a product, and the audience that matters here is
  exactly that: ministerios, fundaciones, other asociaciones.
- **The name is now in circulation.** It has gone into a SEDIA form, a Máshumano
  candidacy and an EPA! encuentro inscription in three weeks. The window where
  nobody has heard of it is closing.

## The decision that actually matters: whose name

This is the same shape as Órdago's store accounts, and it is worth not repeating
that mistake in the other direction. Today every Cultuvilla asset is Álvaro's
personally — the privacy policy and terms name him with his NIF. The asociación
will have a CIF within weeks.

| | Register now, in Álvaro's name | Wait for the CIF |
|---|---|---|
| Risk of losing the name | none | small but real |
| Later work | a holder change, plus whatever transfer lock the registrar applies | none |
| Matches the legal reality | no, and it adds one more personal asset to unwind | yes |

**Leaning: register now, in Álvaro's name, and move it with everything else when
the asociación exists.** A domain holder change is a form, not a renegotiation —
unlike a store payout profile, which is why the Órdago plan sequences that one so
carefully. The asymmetry runs the other way here: losing the name is permanent,
an administrative transfer is not.

That is a lean, not a decision. If the asociación is constituted within days,
waiting costs nothing and is cleaner.

## What to do with it once held

Redirect `cultuvilla.org` → `cultuvilla.es`, nothing more, until there is a
reason. Specifically **do not**:

- point the app or the QR at it — those are printed and shipped,
- add it to `apple-app-site-association`,
- serve duplicate content on both, which splits the Search Console history the
  `.es` domain has been building.

If `.org` ever becomes canonical, that is its own plan with a redirect strategy
and a Search Console move, not a side effect of buying a domain.

## Open questions

- `[unknown: which registrar holds cultuvilla.es today, and under which account?]`
  Registering `.org` in the same place keeps renewals and DNS in one login;
  registering it elsewhere splits them. Worth answering before buying.
- `[unknown: does any grant or third-sector process Cultuvilla is chasing
  actually require or prefer a .org?]` If one does, that decides the priority.
- Register `cultuvilla.com` defensively at the same time? It is free today, it is
  the domain a stranger guesses first, and it is cheap. Decide once rather than
  twice.
- Renewal cost is per-registrar and was not checked — read it at the registrar,
  do not assume.

## Next action

Answer the registrar question, then buy `.org` (and decide on `.com` in the same
sitting). Set auto-renew, and put the renewal date where it will be seen — an
expired domain is a broken redirect and, eventually, someone else's name.
