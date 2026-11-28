/** Every raw shape an event doc could carry, stored or refused by the rules. */
export const EVENT_VISIBILITY_SHAPES: { name: string; raw: Record<string, unknown>; private: boolean }[] = [
  { name: 'public, no pointer', raw: { visibility: 'public', visibilityOrgId: null }, private: false },
  { name: 'legacy: neither field', raw: {}, private: false },
  { name: 'private to an org', raw: { visibility: 'organization', visibilityOrgId: 'org1' }, private: true },
  // The rules refuse the shapes below on write; each must still fail closed.
  { name: 'pointer with enum public', raw: { visibility: 'public', visibilityOrgId: 'org1' }, private: true },
  { name: 'legacy enum private with pointer', raw: { visibility: 'private', visibilityOrgId: 'org1' }, private: true },
  { name: 'empty-string pointer', raw: { visibility: 'public', visibilityOrgId: '' }, private: true },
  // No pointer: the rules let anyone read it, so the predicate does too.
  { name: 'enum organization, no pointer', raw: { visibility: 'organization', visibilityOrgId: null }, private: false },
  { name: 'legacy enum private, no pointer', raw: { visibility: 'private' }, private: false },
];
