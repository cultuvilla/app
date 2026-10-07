# Completar el nomenclátor de pueblos españoles

**Priority:** medium
**Gate:** decision:D8 — does the municipal seat get its own row?
**Next:** settle D8 (leaning: include the seat, flagged `isSeat: true`), then promote to `ready/`

> Decided 2026-08-24, one question still open (see **D8**). Origin: a
> user bug report (2026-08-23) that a resident of Villarino de Manzanas could not
> find their village. PRs #259 and #260 fixed the *search*; this is the *data and
> the model* behind it.

---

## Goal

Every inhabited place in Spain that a person calls "mi pueblo" should be
findable **and joinable**. Today only the 8,167 INE *municipios* are
first-class, so most Spanish villages — which are not municipios — exist at best
as a search alias.

## Background: how Spain is actually organised

Two parallel hierarchies that do not line up.

**Administrative** (who governs): Estado → CCAA → Provincia → **Municipio**
(8,131) → *Entidad Local Menor* (optional, ~3,700, over half in Castilla y
León). An ELM has its own junta vecinal and alcalde pedáneo. This is what
*pedanía* strictly means, and almost nobody uses the word that strictly.

**Statistical** (INE Nomenclátor, how population is counted): Municipio →
*Entidad colectiva* → **Entidad singular** → Núcleo / Diseminado.

- **Entidad singular** is INE's "inhabitable area, clearly differentiated, known
  by a specific name". **This is the level users type into search.**
- **Entidad colectiva** is unused in most of Spain but is the ***parroquia*** in
  Galicia and Asturias, where it dominates local identity.
- Núcleo/diseminado is a statistical split of an entidad singular. Nobody says
  "soy del diseminado" — ignored here, deliberately.

**The vocabulary is regional and contradictory**, which is why the model must
carry a type rather than a single word:

| Word | Region | Means |
| --- | --- | --- |
| _pedanía_ | Castilla y León, Murcia, Valencia | ELM strictly; colloquially any non-seat settlement |
| _parroquia_ | Galicia, Asturias | Entidad colectiva — the primary unit of identity |
| _lugar_ / _aldea_ | Galicia | Entidad singular inside a parroquia |
| _anejo_ / _agregado_ | Castilla | Settlement attached to a municipio |
| **_concejo_** | **Asturias** | **The municipio itself** |
| **_concejo_** | **Álava** | **A sub-municipal ELM** (~330) |
| _barrio_ | Most of Spain | Neighbourhood _within_ a town |
| _barrio_ / _auzo_ | País Vasco, Cantabria | Often a _dispersed rural settlement_ |
| _pago_ | Canarias | Small rural settlement |

Note that pedanías are not a rural curiosity: the city of Murcia governs 54,
Valencia ~19.

## Decisions

### D1 — Source: OpenStreetMap via Overpass

The authoritative gazetteers have **no scriptable download**: the IGN NGMEP
direct archive 404s behind a JS session portal, and the INE Nomenclátor is an
undocumented JSP form that returns a page shell to a scripted POST. Either would
be a blob fetched by hand once and committed with no way to refresh it — a
dataset that rots silently, with no test able to detect it.

OSM is complete, scriptable per province, spatially attachable to the municipio
(`area[name][admin_level=8]`, so no INE code needed), and carries coordinates.

| Source | Figueruela | Lugo | A Coruña | Pontevedra | Ourense |
| --- | ---: | ---: | ---: | ---: | ---: |
| Wikidata (what we ship today) | 6 | 2 | 4 | 3 | 5 |
| OSM `village\|hamlet` | 6 | 11,441 | 13,676 | 7,350 | 4,543 |

Galicia goes from **19 → ~37,000**.

**The tag filter is load-bearing.** Figueruela de Arriba has 260 `place` nodes;
only 7 are settlements:

- `village` / `hamlet` → **entidad singular**. Returned exactly the 6 Wikidata
  knew about, plus the seat. Clean mapping.
- `locality` → **uninhabited toponym** (_Peña las Carreras_, _Alto de Fanales_).
  253 of the 260. **Must be excluded** or search floods with names nobody lives
  in.
- `suburb` / `quarter` / `neighbourhood` → **barrio**. Decent quality (see D5).
- `isolated_dwelling` → diseminado. Out of scope.
- `admin_level=9` relations → **parroquia**. Verified: Vilalba has 29.

### D2 — Licence: proceed under ODbL with attribution

OSM is ODbL, not CC0. Ship "© OpenStreetMap contributors" in the app. The
extracted name list is treated as a _produced work_ rather than a derived
database. **This is a deliberate judgement, not settled law** — recorded here so
it is not silently re-litigated later. It remains the one standing argument for
wanting an INE/IGN source someday.

### D3 — Model: one collection, discriminated by `kind`

`municipalities/{id}/barrios/{id}` gains
`kind: 'barrio' | 'pedania' | 'parroquia'`. No new collection. Reuses the
entity, its detail screen, the residence link (`persons.municipalityLinks`) and
`residentCount` wholesale.

Rejected: a separate `localities/` collection. It would duplicate the entity,
the screens, the rules and the residence link for something that behaves
identically.

### D4 — UI: one scroll per kind

The village home already renders 7 `<Section>` horizontal scrolls, and
[VillageSections.tsx](../../../apps/mobile/components/feature/VillageSections.tsx)
returns `null` for an empty one — so a scroll per kind costs **zero** vertical
space where that kind is absent.

| Village | Sections that render |
| --- | --- |
| Figueruela de Arriba | Pedanías (6) |
| Matabuena | Pedanías (2) |
| Vilalba | Parroquias (29) · Lugares (745) |
| Aranjuez | Pedanías (8) · Barrios (~45) |

This also **dissolves the naming problem** — no adaptive label, no compromise
word. A Galician village shows "Parroquias" because that is the section it has.

### D5 — Seed all three kinds; the admin curates afterwards

**Revised 2026-08-24.** An earlier revision seeded only settlements and left
barrios user-created. Reversed: **seed barrios too.**

The point is the **initial state**. A user signing up should land on a village
page that already knows something about their pueblo, rather than an empty
shell they are asked to fill in. OSM's barrio data supports this — Aranjuez's
_Alpajes_, _El Deleite_, _Vergel_, _Casco Antiguo_ are all real barrios. A few
junk rows (_Polígono Industrial Las Tejeras_, _Academia Especial de la Guardia
Civil_) come with it, and that is acceptable because of D6.

| kind | Seeded from |
| --- | --- |
| `parroquia` | OSM `admin_level=9` |
| `pedania` | OSM `place=village\|hamlet` |
| `barrio` | OSM `place=suburb\|quarter\|neighbourhood` |

> An earlier revision argued *against* seeding barrios from OSM missing 7 of the
> 8 barrios on dev. **That evidence was void** — those rows are invented seed
> fixtures, so OSM lacking them proved nothing.

### D6 — Seeded rows are fully editable by village admins

**Revised 2026-08-24** (was "rename yes, delete no"). The seed is a *starting
point, not a source of truth*. Admins can rename **and delete** any row,
including seeded ones — that is what makes D5 safe: the junk rows OSM brings
along are a two-tap cleanup, not permanent litter.

This is only coherent because of D7: seeding happens **once, at activation**, so
there is no re-seed to resurrect what an admin deleted. If a periodic re-seed is
ever added, it needs a tombstone — noted here so that trap is visible.

Rows still carry `source: 'osm' | 'user'` so the UI can show provenance and a
future re-seed can tell them apart.

### D7 — Seed timing: on activation, not upfront

Writing ~40,000 docs upfront would leave most dormant at `residentCount: 0`
forever. Instead:

- **Discovery** stays where PR #260 put it — `localityNames` + `searchPrefixes`
  on the municipality doc. Covers all 8,167 municipios cheaply, already shipped.
- **Entities** are created when a village activates (`startVillage`), seeding
  that municipio's barrios, pedanías and parroquias at that moment.

So the alias layer answers _"can I find my pueblo?"_ and the entity layer
answers _"now that my village is live, what is in it?"_.

### D8 — OPEN: does the municipal seat get its own row?

OSM's Matabuena returns **three** settlements: _Matamala_, _Cañicosa_ — and
**_Matabuena_ itself**, the `place=village` seat. The current Wikidata script
strips it (`names.delete(entry.name)`), but that was for a search-alias list,
where a municipio matching its own name is pointless. As an *entity* the
trade-off is different:

- **Include it.** INE agrees — the seat *is* an entidad singular. It gives
  residents of the main village a row to belong to, so `residentCount` and the
  censo work symmetrically for everyone. Cost: "Matabuena" appears inside
  Matabuena, which reads as redundant.
- **Exclude it.** The scroll shows only the *other* settlements, which is what a
  villager means by "las pedanías". Cost: residents of the main village have
  nowhere to live — the residence link and barrio censo become asymmetric, with
  Cañicosa residents assignable and Matabuena residents not.

Leaning **include, flagged `isSeat: true`**, rendered first and styled distinctly
(or labelled "el pueblo"), so the data stays symmetric while the UI stops looking
redundant. **Needs a decision before Stage 1.**

## Known risk

**Vilalba's Lugares scroll holds 745 cards.** D4 puts lugares in their own scroll
alongside parroquias rather than nested inside the parroquia detail. `Section`'s
virtualized `data`/`renderItem` path makes this technically fine (lazy render),
and `onManage` gives a full searchable list screen — but a 745-card horizontal
scroll is not _browsable_, only scrollable. Accepted knowingly; revisit if
Galician villages complain. Nesting lugares under parroquias is the fallback.

## File structure

**New**

- `scripts/fetch-settlements.mjs` — OSM/Overpass per-province fetch of
  `place=village|hamlet`, `place=suburb|quarter|neighbourhood` and
  `admin_level=9`, joined to the municipio spatially
- `scripts/data/settlements-es.json` — the fetched dataset
- `scripts/backfill-barrio-kind.mjs` — registered backfill, sets `kind`/`source`
  on existing rows

**Modified**

- `packages/shared/src/models/municipality/MunicipalityDataModel.ts` —
  `BarrioDataSchema` gains `kind`, `source`, and (pending D8) `isSeat`
- `packages/shared/src/services/municipalityService.ts` — `getBarrios(kind?)`
- `functions/src/village/startVillage.ts` — seed settlements on activation
- `apps/mobile/components/feature/VillageHomeBody.tsx` — one Section per kind
- `apps/mobile/lib/useVillageHome.ts` — split `barrios` by kind
- `packages/i18n/messages/es.json` — section titles, kind picker
- `firestore.rules` — `kind`/`source` function-owned; admins may rename and
  delete any row
- `scripts/data/seed-fixtures/real_villages_1/fixtures.mjs` — replace the
  invented _Villares de Matabuena_ with the real _Matamala_ / _Cañicosa_

## Tasks

### Stage 1 — Data

- [ ] Settle **D8** (seat row or not)
- [ ] Write `scripts/fetch-settlements.mjs` (Overpass, per province, retry/backoff
      for 429 + 504 + truncated-200, as in `fetch-localities.mjs`)
- [ ] Exclude `place=locality` explicitly, with a test asserting Figueruela
      yields 6–7 settlements and not 260
- [ ] Fetch and commit `settlements-es.json`; record per-province counts
- [ ] Add "© OpenStreetMap contributors" attribution to the app's legal screen

### Stage 2 — Model

- [ ] `kind` + `source` on `BarrioDataSchema` (+ builder, + tests)
- [ ] `backfill-barrio-kind.mjs` — existing rows default to `kind: 'barrio'`,
      `source: 'user'`; `pre-deploy`, `autoApply`, idempotent
- [ ] Firestore rules: `kind`/`source` function-owned; admins may rename/delete
- [ ] Fix the `real_villages_1` fixture

### Stage 3 — Seeding

- [ ] `startVillage` seeds all three kinds for the activated municipio
- [ ] Re-activation is idempotent (no duplicate rows)
- [ ] Emulator test: activating Figueruela de Arriba creates its 6 pedanías

### Stage 4 — UI

- [ ] `useVillageHome` splits barrios by kind
- [ ] One `<Section>` per kind, virtualized path for large ones
- [ ] Kind picker in the add-barrio form
- [ ] i18n strings

## Out of scope

- Núcleo / diseminado.
- Historical or disappeared settlements.
- Entidad Local Menor as a _governance_ concept (juntas vecinales with their own
  admins). Modelled as `pedania` for now; revisit if a real ELM asks.
- Anything outside Spain.

## Related

- PR [#259](https://github.com/alvaro-francisco-gil/cultuvilla/pull/259) — per-word search index
- PR [#260](https://github.com/alvaro-francisco-gil/cultuvilla/pull/260) — `localityNames` alias layer
- `scripts/fetch-localities.mjs` — the Wikidata locality fetch this supersedes
- [docs/architecture/municipality-vs-village.md](../../architecture/municipality-vs-village.md)
