# Family Tree — Idea Exploration

**Priority:** low

> Pre-spec exploration. Not yet a formal design. Use as reference before writing the full spec.

---

## What we're building

A family tree section for each village — a multi-generational genealogy graph where:

- Anyone (village member) can **propose** new people or relationships
- Only certain roles (village admin, or a dedicated "árbol moderator") can **approve** additions
- The tree includes both living villagers and deceased ancestors
- People can be linked across villages (a person from one pueblo who married into another is one person, not two entries)

---

## Key architectural decision

The family tree lives in a **top-level `/people` collection**, not nested under any village. This is consistent with the open-feed migration (events and orgs also moving to top-level).

```
/people/{personId}           ← canonical person, global
/relationships/{relId}       ← edges between people
```

A person has a `villageIds: string[]` field. "Show the tree for village X" is just a query:
`where villageIds array-contains 'villageX'`

This avoids duplicating people who belong to multiple village lineages — María Hernández is one document even if she appears in three pueblo trees.

**Distinction from existing concepts:**

| Concept | What it is |
|---|---|
| `User` | A Firebase auth account |
| `Persona` | A proxy the user registers for events (up to 50/user) |
| `Person` (tree node) | A human in the genealogy — may be alive or deceased, may or may not have a user account |

A living villager who uses the app can be linked: `Person.userId = 'uid123'`. A deceased great-grandparent is just a Person with no userId.

---

## Data model sketch (not final)

```ts
// /people/{personId}
interface Person {
  // Identity
  firstName: string
  lastName: string              // primer apellido
  secondLastName?: string       // segundo apellido
  maidenName?: string
  nickname?: string             // mote del pueblo
  gender?: 'male' | 'female' | 'other'

  // Dates
  birthYear?: number
  birthDate?: Date
  deathYear?: number
  deathDate?: Date
  alive: boolean

  // Village links
  villageIds: string[]          // pueblos this person belongs to
  birthVillageId?: string

  // App link (if they're a user)
  userId?: string

  // Moderation
  status: 'pending' | 'approved' | 'rejected'
  proposedBy: string            // userId
  proposedAt: Date
  approvedBy?: string
  approvedAt?: Date

  // Media
  photoUrl?: string
}

// /relationships/{relId}
interface Relationship {
  personAId: string
  personBId: string
  type: 'parent-child' | 'spouse' | 'adopted'
  // For parent-child: personA is parent, personB is child
  villageIds: string[]          // for filtering

  status: 'pending' | 'approved' | 'rejected'
  proposedBy: string
  proposedAt: Date
  approvedBy?: string
  approvedAt?: Date
}
```

---

## Technology choice: Firestore + React Flow

### Why not a graph database (Neo4j, etc.)

Graph databases (Neo4j, AuraDB) excel at deep traversal queries — finding all ancestors, computing relationship paths between two people, "how is Pedro related to Carmen?". These queries are expensive on Firestore because every hop is a separate network round trip.

**However, for village scale this doesn't matter:**

- A village tree is roughly 500–3,000 people and 1,000–8,000 relationships — ~300-500KB of JSON
- The correct approach is **load the full village tree once** into memory, then run all traversals client-side
- This eliminates the N+1 round-trip problem entirely
- A graph DB would add: new infrastructure, new query language (Cypher), no real-time sync, permissions bridge layer — significant complexity for no practical gain at this scale

The crossover point where a graph DB pays off: multi-village "how are these strangers related?" queries, or trees exceeding ~10,000 nodes. That's a v2 problem.

### Query capability comparison

| Query | Firestore approach | Cost |
|---|---|---|
| Fetch one person | Direct doc fetch | Trivial |
| Direct relatives | 2 round trips | Trivial |
| N-generation ancestors | Load-all, traverse in memory | Fine at village scale |
| Path between two people | Load-all, BFS/DFS client-side | Fine at village scale |
| All descendants of X | Load-all, traverse in memory | Fine at village scale |
| All pending proposals | `where status == 'pending'` | Trivial |
| All people in village X | `where villageIds array-contains 'X'` | Trivial |

### Visualization: React Flow

Rendering 2,000 nodes simultaneously on screen is visually useless and technically taxing. All serious genealogy apps (Ancestry, Geni, FamilySearch) use the same pattern:

> **Centrado en una persona** — show N generations up, M generations down from a selected person. Navigate by clicking relatives.

**React Flow** (`reactflow`) is the right library for this:
- SVG + React component nodes — each person card is a standard React component
- Handles ~1,000 nodes comfortably, more than enough for village scale
- Interactive: pan, zoom, click to navigate
- Custom nodes: photo, name, dates, "proposed" badge for pending entries

A secondary "full village overview" mode is viable as a simplified zoomed-out map (small nodes, just names), not as the primary interaction.

---

## Roles and moderation flow

```
Village member  →  proposes a Person or Relationship  →  status: 'pending'
Village admin   →  approves/rejects                   →  status: 'approved'/'rejected'
```

A dedicated "árbol moderator" role (separate from village admin) is worth considering — someone trusted with genealogy accuracy who isn't necessarily the org admin. TBD in full spec.

---

## Open questions (for full spec)

1. **Árbol moderator role:** separate role, or just village admin?
2. **Privacy for living people:** should living person details (full birthdate, address) be restricted to village members only, with public view showing only name + approximate decade?
3. **GEDCOM import/export:** standard genealogy format — worth supporting for people who already have family tree data in other apps?
4. **Merge/deduplication:** when two people propose the same ancestor, how do we detect and merge duplicates?
5. **Relationship to Personas:** if a user has a Persona for their grandmother, and that grandmother is also added to the tree, should they be linkable?
