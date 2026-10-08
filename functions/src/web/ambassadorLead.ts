import { createHash } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import { buildAmbassadorLeadData, municipalitySearchKey, normalizeLeadPhone } from '@cultuvilla/shared/models';
import { ambassadorLeadsCollection } from '@cultuvilla/shared/firebase/refs/admin';
import { str, type Raw } from './read';

/**
 * The one write the read site makes: a would-be Embajador's name and phone from
 * the /embajadores form (docs/decisions/web-is-a-read-site.md, "The one form").
 * Everything here runs before a byte is stored, because the form is anonymous.
 */

export interface PuebloOption {
  id: string;
  name: string;
  province: string;
}

export interface AmbassadorForm {
  pueblo: string;
  municipalityId: string;
  nombre: string;
  telefono: string;
  consentimiento: boolean;
  /** Honeypot: hidden from people, filled in by bots. */
  web: string;
}

export type AmbassadorFormField = 'pueblo' | 'nombre' | 'telefono' | 'consentimiento' | 'form';
export type AmbassadorFormErrors = Partial<Record<AmbassadorFormField, string>>;

export type LeadOutcome = { ok: true } | { ok: false; errors: AmbassadorFormErrors; form: AmbassadorForm };

/** Submissions one network may make in a day before the form asks them to write instead. */
export const LEADS_PER_IP_PER_DAY = 5;
const MAX_TEXT = 80;
const DAY_MS = 24 * 60 * 60 * 1000;

const field = (body: Record<string, unknown>, key: string): string => {
  const v = body[key];
  return typeof v === 'string' ? v.trim().slice(0, MAX_TEXT * 2) : '';
};

export function readAmbassadorForm(body: unknown): AmbassadorForm {
  const b = body !== null && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  return {
    pueblo: field(b, 'pueblo'),
    municipalityId: field(b, 'municipalityId'),
    nombre: field(b, 'nombre'),
    telefono: field(b, 'telefono'),
    consentimiento: field(b, 'consentimiento') !== '',
    web: field(b, 'web'),
  };
}

export function validateAmbassadorForm(form: AmbassadorForm): AmbassadorFormErrors {
  const errors: AmbassadorFormErrors = {};
  if (form.pueblo.length < 2) errors.pueblo = 'Escribe el nombre de tu pueblo.';
  if (form.nombre.length < 2 || form.nombre.length > MAX_TEXT) errors.nombre = 'Escribe tu nombre.';
  if (!normalizeLeadPhone(form.telefono)) errors.telefono = 'Escribe un teléfono válido, por ejemplo 612 345 678.';
  if (!form.consentimiento) errors.consentimiento = 'Necesitamos tu permiso para llamarte.';
  return errors;
}

/** The picker shows "Name (Province)"; a typed name loses that suffix before it is looked up. */
const bareName = (pueblo: string): string => pueblo.replace(/\s*\([^)]*\)\s*$/, '');

export async function searchPueblos(db: Firestore, q: string, limit = 8): Promise<PuebloOption[]> {
  const key = municipalitySearchKey(q.trim());
  if (key.length < 2) return [];
  // typed-refs: allowed — converter-less read, like the rest of the read site:
  // a picker must not fail because one municipality has a stale field.
  const snap = await db
    .collection('municipalities')
    .where('searchPrefixes', 'array-contains', key)
    .orderBy('nameLower', 'asc')
    .limit(limit)
    .get();
  return snap.docs.map((d) => {
    const data: Raw = d.data();
    return { id: d.id, name: str(data['name']) ?? '', province: str(data['province']) ?? '' };
  });
}

/** The municipality the visitor meant: the one they picked, else a sole exact match on what they typed. */
async function resolvePueblo(db: Firestore, form: AmbassadorForm): Promise<{ id: string | null; name: string }> {
  if (form.municipalityId) {
    // typed-refs: allowed — converter-less read; see searchPueblos.
    const doc = await db.collection('municipalities').doc(form.municipalityId).get();
    if (doc.exists) {
      const data = doc.data() as Raw;
      const name = str(data['name']) ?? form.pueblo;
      const province = str(data['province']);
      return { id: doc.id, name: province ? `${name} (${province})` : name };
    }
  }
  const typed = bareName(form.pueblo);
  const exact = (await searchPueblos(db, typed, 3)).filter((p) => municipalitySearchKey(p.name) === municipalitySearchKey(typed));
  return exact.length === 1 ? { id: exact[0].id, name: `${exact[0].name} (${exact[0].province})` } : { id: null, name: form.pueblo };
}

/** Throttle key: a hash, so the stored lead never holds the address itself. */
export function hashIp(ip: string): string {
  return createHash('sha256').update(`ambassadorLead|${ip}`).digest('hex').slice(0, 32);
}

export async function submitAmbassadorLead(db: Firestore, body: unknown, ip: string, now: Date): Promise<LeadOutcome> {
  const form = readAmbassadorForm(body);
  // A bot that filled the hidden field is told it worked and nothing is stored.
  if (form.web) return { ok: true };
  const errors = validateAmbassadorForm(form);
  if (Object.keys(errors).length > 0) return { ok: false, errors, form };

  const ipHash = hashIp(ip);
  const recent = await ambassadorLeadsCollection(db).where('ipHash', '==', ipHash).limit(LEADS_PER_IP_PER_DAY * 4).get();
  const today = recent.docs.filter((d) => now.getTime() - d.data().createdAt.getTime() < DAY_MS).length;
  if (today >= LEADS_PER_IP_PER_DAY) {
    return { ok: false, form, errors: { form: 'Ya nos han llegado varias solicitudes desde aquí. Escríbenos a cultuvilla.app@gmail.com y lo vemos.' } };
  }

  const pueblo = await resolvePueblo(db, form);
  const phone = normalizeLeadPhone(form.telefono);
  if (!phone) return { ok: false, form, errors: { telefono: 'Escribe un teléfono válido, por ejemplo 612 345 678.' } };
  await ambassadorLeadsCollection(db).add(
    buildAmbassadorLeadData({
      municipalityId: pueblo.id,
      municipalityName: pueblo.name,
      name: form.nombre.slice(0, MAX_TEXT),
      phone,
      ipHash,
      createdAt: now,
    }),
  );
  return { ok: true };
}
