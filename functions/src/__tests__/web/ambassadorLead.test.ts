import { describe, it, expect } from 'vitest';
import { hashIp, readAmbassadorForm, validateAmbassadorForm } from '../../web/ambassadorLead';

describe('the /embajadores form', () => {
  const good = { pueblo: 'Matabuena (Segovia)', municipalityId: 'm1', nombre: 'Ana', telefono: '612 345 678', consentimiento: 'si', web: '' };

  it('reads only the fields it knows, trimmed, and treats any consent value as a yes', () => {
    expect(readAmbassadorForm({ ...good, nombre: '  Ana  ', extra: 'x' })).toEqual({
      pueblo: 'Matabuena (Segovia)', municipalityId: 'm1', nombre: 'Ana', telefono: '612 345 678', consentimiento: true, web: '',
    });
    expect(readAmbassadorForm(null)).toMatchObject({ pueblo: '', consentimiento: false });
    expect(readAmbassadorForm({ nombre: 42 }).nombre).toBe('');
  });

  it('accepts a complete form', () => {
    expect(validateAmbassadorForm(readAmbassadorForm(good))).toEqual({});
  });

  it('names every missing or wrong field', () => {
    const errors = validateAmbassadorForm(readAmbassadorForm({ pueblo: 'M', nombre: '', telefono: '123', web: '' }));
    expect(Object.keys(errors).sort()).toEqual(['consentimiento', 'nombre', 'pueblo', 'telefono']);
  });

  it('keeps the visitor address out of the stored hash', () => {
    const h = hashIp('203.0.113.7');
    expect(h).toMatch(/^[0-9a-f]{32}$/);
    expect(h).not.toContain('203');
    expect(hashIp('203.0.113.7')).toBe(h);
    expect(hashIp('203.0.113.8')).not.toBe(h);
  });
});
