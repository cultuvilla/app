import { describe, it, expect } from 'vitest';
import { NotifyEnvelopeSchema, notifyEnvelope, NOTIFY_TITLE_MAX } from '@cultuvilla/shared/models';
import { ambassadorLeadAlert, organizerRequestAlert } from '../../notify/ambassadorAlerts';

describe('organizerRequestAlert', () => {
  const base = {
    projectId: 'cultuvilla-prod',
    requestId: 'PuQ46SL007v5r8rODa13',
    municipalityName: 'Santillana del Mar',
    province: 'Cantabria',
  };

  it('says what happened and where, and links the admin queue in the app', () => {
    const m = organizerRequestAlert(base);
    expect(m.title).toBe('Nueva solicitud de Embajador');
    expect(m.body).toBe('Santillana del Mar (Cantabria)');
    expect(m.link).toBe('https://cultuvilla.es/admin/solicitudes-organizador');
    expect(m.dedupeKey).toBe('organizer-request:PuQ46SL007v5r8rODa13');
  });

  it('links the env-own host outside production', () => {
    expect(organizerRequestAlert({ ...base, projectId: 'cultuvilla-beta' }).link).toBe(
      'https://cultuvilla-beta.web.app/admin/solicitudes-organizador',
    );
  });

  it('survives a request with no pueblo', () => {
    const m = organizerRequestAlert({ ...base, municipalityName: null, province: null });
    expect(m.body).toBe('pueblo desconocido');
  });
});

describe('ambassadorLeadAlert', () => {
  it('names only the pueblo, flags one that matched nothing, and links the lead doc', () => {
    const m = ambassadorLeadAlert({
      projectId: 'cultuvilla-prod',
      leadId: 'L1',
      municipalityName: 'Villarriba',
      matched: false,
    });
    expect(m.title).toBe('Nuevo contacto desde /embajadores');
    expect(m.body).toBe('Villarriba (sin identificar)');
    expect(m.link).toBe(
      'https://console.firebase.google.com/project/cultuvilla-prod/firestore/databases/-default-/data/~2FambassadorLeads~2FL1',
    );
    expect(m.dedupeKey).toBe('ambassador-lead:L1');
  });
});

describe('notifyEnvelope', () => {
  const message = organizerRequestAlert({
    projectId: 'cultuvilla-prod',
    requestId: 'r1',
    municipalityName: 'Matabuena',
    province: 'Segovia',
  });

  it('builds a gateway-valid envelope for the cultuvilla channel', () => {
    const env = notifyEnvelope('cultuvilla-prod', message);
    expect(NotifyEnvelopeSchema.parse(env)).toEqual(env);
    expect(env).toMatchObject({ channel: 'cultuvilla', source: 'cultuvilla-app', severity: 'info', dedupe_key: 'organizer-request:r1' });
    expect(env.title).toBe('Nueva solicitud de Embajador');
    expect(env.body).toBe('Matabuena (Segovia)');
  });

  it('tags non-production titles with their environment', () => {
    expect(notifyEnvelope('cultuvilla-beta', message).title).toMatch(/^\[beta\] /);
    expect(notifyEnvelope('villa-events', message).title).toMatch(/^\[dev\] /);
  });

  it('clamps an overlong title instead of failing', () => {
    const env = notifyEnvelope('cultuvilla-prod', { ...message, title: 'x'.repeat(500) });
    expect(env.title).toHaveLength(NOTIFY_TITLE_MAX);
  });
});
