import { z } from 'zod';
import { SexSchema, type Sex } from '../core/SexModel';

export const PartialDateSchema = z.object({
  year: z.number().int().nullable(),
  month: z.number().int().nullable(), // 1–12 (not enforced; matches legacy shape)
  day: z.number().int().nullable(),   // 1–31 (not enforced; matches legacy shape)
});
export type PartialDate = z.infer<typeof PartialDateSchema>;

export const MunicipalityLinkSchema = z.object({
  municipalityId: z.string(),
  barrioId: z.string().nullable(),
});
export type MunicipalityLink = z.infer<typeof MunicipalityLinkSchema>;

export const BurialPlaceSchema = z.object({
  municipalityId: z.string(),
  placeId: z.string(), // references a /municipalities/{id}/places doc with kind === 'cemetery'
});
export type BurialPlace = z.infer<typeof BurialPlaceSchema>;

export const PersonDataSchema = z.object({
  // Name
  givenName: z.string(),
  middleNames: z.array(z.string()),
  firstSurname: z.string().nullable(),
  secondSurname: z.string().nullable(),
  nickname: z.string().nullable(),
  sex: SexSchema.nullable(),

  // Dates
  birthday: PartialDateSchema.nullable(),
  deathDate: PartialDateSchema.nullable(),

  // Places
  birthPlace: MunicipalityLinkSchema.nullable(),
  burialPlace: BurialPlaceSchema.nullable(),
  municipalityLinks: z.array(MunicipalityLinkSchema),

  // Work — multi-select; each entry is an occupation-catalog key or free text
  occupations: z.array(z.string()).default([]),

  // Bio
  biography: z.string().nullable(),
  photoURL: z.string().nullable(),

  // Auth link
  userId: z.string().nullable(),            // Firebase Auth uid if this person has an account

  // Privacy — a dependent persona's creator can make their card unreadable to
  // everyone else. The name still shows in village rosters (those read the
  // municipalityPeople projection); the person doc itself is denied by rules.
  // Account personas are always public: an account holder's profile is their
  // public face in the pueblo.
  isPublic: z.boolean(),

  // Meta
  createdBy: z.string(),
  createdAt: z.date(),
});
export type PersonData = z.infer<typeof PersonDataSchema>;

export interface PersonDataInput {
  givenName: string;
  middleNames?: string[];
  firstSurname?: string | null;
  secondSurname?: string | null;
  nickname?: string | null;
  sex?: Sex | null;
  birthday?: PartialDate | null;
  deathDate?: PartialDate | null;
  birthPlace?: MunicipalityLink | null;
  burialPlace?: BurialPlace | null;
  municipalityLinks?: MunicipalityLink[];
  occupations?: string[];
  biography?: string | null;
  photoURL?: string | null;
  userId?: string | null;
  isPublic?: boolean;
  createdBy: string;
}

export function buildPersonData(input: PersonDataInput): PersonData {
  return {
    givenName: input.givenName,
    middleNames: input.middleNames ?? [],
    firstSurname: input.firstSurname ?? null,
    secondSurname: input.secondSurname ?? null,
    nickname: input.nickname ?? null,
    sex: input.sex ?? null,
    birthday: input.birthday ?? null,
    deathDate: input.deathDate ?? null,
    birthPlace: input.birthPlace ?? null,
    burialPlace: input.burialPlace ?? null,
    municipalityLinks: input.municipalityLinks ?? [],
    occupations: input.occupations ?? [],
    biography: input.biography ?? null,
    photoURL: input.photoURL ?? null,
    userId: input.userId ?? null,
    isPublic: input.isPublic ?? true,
    createdBy: input.createdBy,
    createdAt: new Date(),
  };
}

/**
 * Build the `municipalityLinks` array for a person from a single residence
 * selection. Returns `[]` when no village is chosen, otherwise a one-element
 * array. The link shape is exactly `{ municipalityId, barrioId }` so it matches
 * the `array-contains` query in `getPersonsByBarrio`.
 */
export function buildResidenceLinks(
  municipalityId: string | null,
  barrioId: string | null,
): MunicipalityLink[] {
  if (!municipalityId) return [];
  return [{ municipalityId, barrioId }];
}

/** Full display name: "Juan Carlos García López" */
export function buildDisplayName(
  person: Pick<PersonData, 'givenName' | 'middleNames' | 'firstSurname' | 'secondSurname'>,
): string {
  return [person.givenName, ...person.middleNames, person.firstSurname, person.secondSurname]
    .filter(Boolean)
    .join(' ');
}

/**
 * A person is considered deceased once either death signal is present: a
 * recorded `deathDate` or a `burialPlace` (cemetery) assignment. Burial writes
 * both at once, but the two can drift (a death date can be set before burial),
 * so we treat either as sufficient — this keeps anyone buried out of the
 * living-residents lists.
 */
export function isDeceased(person: Pick<PersonData, 'deathDate' | 'burialPlace'>): boolean {
  return person.deathDate !== null || person.burialPlace !== null;
}

/** Short name for tight spaces: nickname if set, otherwise "Juan García" */
export function buildShortName(
  person: Pick<PersonData, 'givenName' | 'nickname' | 'firstSurname'>,
): string {
  return person.nickname ?? [person.givenName, person.firstSurname].filter(Boolean).join(' ');
}

/** Full name with the nickname appended in parentheses: "Juan Carlos García López (Juanito)" */
export function buildNameWithNickname(
  person: Pick<
    PersonData,
    'givenName' | 'middleNames' | 'firstSurname' | 'secondSurname' | 'nickname'
  >,
): string {
  const full = buildDisplayName(person);
  const nickname = person.nickname?.trim();
  if (!nickname) return full;
  return full ? `${full} (${nickname})` : nickname;
}
