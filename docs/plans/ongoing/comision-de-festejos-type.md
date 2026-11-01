# Comisión de festejos group type

**Priority:** medium
**Landed:** dev
**Gate:** soak:step 1 live in prod and delivered by OTA — then step 2 is a breaking release the user runs (Play managed publishing, `pnpm release:publish`)
**Next:** step 2 — offer `comisión` in `PROPOSABLE_ORGANIZATION_TYPES`, `OrgRequestFormSchema`, the `entidades.tsx` aliases and the rules' create/update type lists, with a `Breaking-Client:` trailer

Decided 2026-11-01 (user): add a `comisión` organization type, labelled
"Comisión de festejos". Closes OQ-4 in [business-rules.md](../../business-rules.md)
for this one type.

## Decisions

- **Two-step rollout.** Installed binaries parse `organizations` with a strict
  `z.enum`, and one unknown `type` in a village makes the whole org list throw.
  1. **Expand:** clients read an unknown `type` as `otros`, and know `comisión`
     (label, home section, roster tier, rules). Nothing offers to create one. Ships
     by OTA to every binary built since 2026-10-06.
  2. **Enable:** the create/edit forms offer `comisión`. This release carries a
     `Breaking-Client:` trailer that raises `minSupported` to step 1's version, for the
     pre-OTA binaries that cannot read the type.
- **Unlimited per village**, like a peña: client-side create, village admin approves.
  No callable, no cap. A cap later is a product rule and needs a yes.
- **Feature tier v1 = the socio-roster tier** (avisos, cuota, actas, registros,
  tareas, eventos, miembros): add `comisión` to `SOCIO_ROSTER_ORG_TYPES` and the
  rules' `orgHasSocioRoster`. Comisión-specific features (yearly mandate and handover,
  link to fiestas/cartel/programa, per-household derrama, patrocinadores, lotería)
  are a later plan, to be picked with the user.
- **Own section on the village home**, above the peñas, on the app and the read site.
- **Switchable** among the self-service kinds (peña, asociación, otros, comisión) on
  the edit screen and in the rules' `type` update check.
- **Stored id `comisión`**, label "Comisión de festejos".

## Context

Prod, Matabuena (`digSmD1NFyaOJCPQ99cC`), 2026-11-01: 8 peñas, 3 asociaciones,
1 otros, all approved. One of the asociaciones is "Comisión de Festejos de
Matabuena" — the first group to switch once step 2 ships (its admins can do it
themselves).

## Touch points

- `OrganizationDataModel.ts` (enum + `PROPOSABLE_ORGANIZATION_TYPES`; unknown → `otros`
  on read), `SocioDataModel.ts`, `OrgRequestFormSchema.ts`
- `firestore.rules`: `isValidOrganizationCreate`, `orgHasSocioRoster`, org `update`
  type check — plus rules tests
- `scripts/backfill-socio-roster.mjs` `ROSTER_ORG_TYPES`
- `packages/i18n/messages/es.json` type labels and the home section title
- `VillageHomeBody.tsx`, `ProfileView.tsx`, read site (`functions/src/web/`)
- `docs/business-rules.md` OQ-4, `docs/decisions/` record once shipped

## Step 1 (expand) — done in code

The enum knows `comisión` and reads any unknown type as `otros`; the roster tier,
rules' `orgHasSocioRoster`, labels and the home sections (app and read site) know it.
Rules still refuse creating or switching to one — that opening is step 2.
