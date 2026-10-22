import { describe, it, expect } from 'vitest';
import { NotifyEnvelopeSchema, notifyEnvelope, NOTIFY_TITLE_MAX } from '@cultuvilla/shared/models';
import { ambassadorLeadAlert, organizerRequestAlert } from '../../notify/ambassadorAlerts';

describe('organizerRequestAlert', () => {
  const base = {
    projectId: 'cultuvilla-prod',
    requestId: 'PuQ46SL007v5r8rODa13',
    requesterName: 'Estefanía Liaño Pérez',
    municipalityName: 'Santillana del Mar',
    province: 'Cantabria',
    motivation: 'Quiero dar visibilidad a mi pueblo.',
  };

  it('names the pueblo, the requester and the motivation, and links the doc', () => {
    const m = organizerRequestAlert(base);
    expect(m.title).toBe('Solicitud de Embajador: Santillana del Mar (Cantabria)');
    expect(m.body).toBe('Estefanía Liaño Pérez · desde la app\n«Quiero dar visibilidad a mi pueblo.»');
    expect(m.link).toBe(
      'https://console.firebase.google.com/project/cultuvilla-prod/firestore/databases/-default-/data/~2ForganizerRequests~2FPuQ46SL007v5r8rODa13',
    );
    expect(m.dedupeKey).toBe('organizer-request:PuQ46SL007v5r8rODa13');
  });

  it('survives a request with no motivation, requester name or pueblo', () => {
    const m = organizerRequestAlert({ ...base, requesterName: null, municipalityName: null, province: null, motivation: null });
    expect(m.title).toBe('Solicitud de Embajador: pueblo desconocido');
    expect(m.body).toBe('Alguien · desde la app');
  });
});

describe('ambassadorLeadAlert', () => {
  it('carries name and phone, and flags a pueblo that matched nothing', () => {
    const m = ambassadorLeadAlert({
      projectId: 'cultuvilla-prod',
      leadId: 'L1',
      name: 'Juan',
      phone: '+34612345678',
      municipalityName: 'Villarriba',
      matched: false,
    });
    expect(m.title).toBe('Embajador desde la web: Villarriba (sin identificar)');
    expect(m.body).toBe('Juan · +34612345678');
    expect(m.dedupeKey).toBe('ambassador-lead:L1');
  });
});

describe('notifyEnvelope', () => {
  const message = organizerRequestAlert({
    projectId: 'cultuvilla-prod',
    requestId: 'r1',
    requesterName: 'Ana',
    municipalityName: 'Matabuena',
    province: 'Segovia',
    motivation: null,
  });

  it('builds a gateway-valid envelope for the cultuvilla channel', () => {
    const env = notifyEnvelope('cultuvilla-prod', message);
    expect(NotifyEnvelopeSchema.parse(env)).toEqual(env);
    expect(env).toMatchObject({ channel: 'cultuvilla', source: 'cultuvilla-app', severity: 'info', dedupe_key: 'organizer-request:r1' });
    expect(env.title).toBe('Solicitud de Embajador: Matabuena (Segovia)');
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
