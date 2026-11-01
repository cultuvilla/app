# The comisión de festejos group type

The group that runs a pueblo's fiestas is its own organization type: `comisión`,
labelled "Comisión de festejos". Decided 2026-11-01 (user).

## Decision

- **Unlimited per village, proposed like a peña.** Some pueblos have one comisión per
  barrio or per fiesta, so it is not a singleton like the ayuntamiento. Any member
  proposes one and a village admin approves it.
- **Same tools as a peña or asociación.** It joins `SOCIO_ROSTER_ORG_TYPES`, so features
  stay keyed to that capability rather than to the type.
- **It stays under Grupos**, in the app and on the read site. Its card says "Comisión de
  festejos" where the others show their member count; another horizontal row was not wanted.
- **It moves freely among the self-service kinds**, so a comisión already filed as an
  asociación or under otros can switch. Only the ayuntamiento stays fixed.

## Why its release is breaking

Installed binaries parse `organizations.type` with a strict `z.enum`. One group of an
unknown type makes that village's whole group list throw, so a new type cannot simply
be created.

1. **Expand.** The enum learned the type, and `OrganizationDataSchema` reads a type it
   does not know as `otros`.
2. **Enable.** The forms offer the type and the rules accept it. This commit carries
   `Breaking-Client:`, so the release holds its backend and raises `minSupported` to its
   own version; binaries too old to read the type are walled.

Both reached develop before either reached prod, so they share one release. The fallback
means the next new type does not need the wall, once `minSupported` has passed that release.
