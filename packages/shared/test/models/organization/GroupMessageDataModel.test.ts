import { describe, it, expect } from 'vitest';
import {
  canNudgeGroupMessage,
  GROUP_MESSAGE_NUDGE_INTERVAL_MS,
  groupMessageSignatureLines,
  groupMessageWhatsappText,
  SendGroupMessageInputSchema,
  tallyGroupPoll,
  unreadRecipientUids,
  whatsappLink,
} from '../../../src/models/organization/GroupMessageDataModel';

const input = (over: Record<string, unknown> = {}) => ({
  orgId: 'org1',
  messageId: 'AbCdEfGhIj12',
  title: 'Asamblea',
  body: 'El sábado a las 18:00.',
  audience: { kind: 'all', eventId: null },
  channels: { push: true, email: true, whatsapp: 'none' },
  pinned: false,
  poll: null,
  ...over,
});

describe('SendGroupMessageInputSchema', () => {
  it('accepts a plain message and trims it', () => {
    const parsed = SendGroupMessageInputSchema.parse(input({ title: '  Asamblea  ' }));
    expect(parsed.title).toBe('Asamblea');
  });

  it('wants an event id for the event audience, and only there', () => {
    expect(SendGroupMessageInputSchema.safeParse(input({ audience: { kind: 'event', eventId: null } })).success).toBe(false);
    expect(SendGroupMessageInputSchema.safeParse(input({ audience: { kind: 'all', eventId: 'ev1' } })).success).toBe(false);
    expect(SendGroupMessageInputSchema.safeParse(input({ audience: { kind: 'event', eventId: 'ev1' } })).success).toBe(true);
  });

  it('refuses a blank message, a yes/no poll without two options and a one-option poll', () => {
    expect(SendGroupMessageInputSchema.safeParse(input({ body: '   ' })).success).toBe(false);
    expect(
      SendGroupMessageInputSchema.safeParse(input({ poll: { question: '¿Vienes?', kind: 'yes_no', options: ['Sí', 'No', 'Quizá'] } })).success,
    ).toBe(false);
    expect(SendGroupMessageInputSchema.safeParse(input({ poll: { question: '¿Fecha?', kind: 'choice', options: ['12'] } })).success).toBe(false);
    expect(
      SendGroupMessageInputSchema.safeParse(input({ poll: { question: '¿Fecha?', kind: 'choice', options: ['12', '19', '26'] } })).success,
    ).toBe(true);
  });

  it('refuses an id a client could not have minted', () => {
    expect(SendGroupMessageInputSchema.safeParse(input({ messageId: '../x' })).success).toBe(false);
  });
});

describe('group message helpers', () => {
  it('lists the unread with the app, never the sender', () => {
    expect(unreadRecipientUids({ recipientUids: ['admin', 'a', 'b', 'c'], sentBy: 'admin' }, ['b'])).toEqual(['a', 'c']);
  });

  it('lets a nudge through once the interval has passed', () => {
    const now = new Date('2026-10-21T12:00:00Z');
    expect(canNudgeGroupMessage({ lastNudgedAt: null }, now)).toBe(true);
    expect(canNudgeGroupMessage({ lastNudgedAt: new Date(now.getTime() - 60_000) }, now)).toBe(false);
    expect(canNudgeGroupMessage({ lastNudgedAt: new Date(now.getTime() - GROUP_MESSAGE_NUDGE_INTERVAL_MS) }, now)).toBe(true);
  });

  it('tallies votes per option and ignores a stray one', () => {
    expect(tallyGroupPoll({ options: ['12', '19'] }, [{ option: 0 }, { option: 1 }, { option: 1 }, { option: 7 }])).toEqual([1, 2]);
  });

  it('signs with the name and the title of the group', () => {
    expect(groupMessageSignatureLines({ signerName: 'Luis', signerTitle: 'tesorero', orgName: 'La Anduela' })).toEqual([
      'Luis',
      'Tesorería · La Anduela',
    ]);
    expect(groupMessageSignatureLines({ signerName: 'Eva', signerTitle: null, orgName: 'La Anduela' })).toEqual(['Eva', 'La Anduela']);
  });

  it('writes the WhatsApp text and its click-to-chat link', () => {
    const text = groupMessageWhatsappText(
      {
        title: 'Cena',
        body: 'Elegid fecha.',
        poll: { question: '¿12 o 19?', kind: 'choice', options: ['12', '19'] },
        signerName: 'Luis',
        signerTitle: 'presidente',
        orgName: 'La Anduela',
      },
      'https://cultuvilla.es/grupos?grupo=org1',
    );
    expect(text).toBe(
      '*Cena*\n\nElegid fecha.\n\n¿12 o 19? Responde en la app: https://cultuvilla.es/grupos?grupo=org1\n\n— Luis\nPresidencia · La Anduela',
    );
    expect(whatsappLink('+34600111222', 'Hola y adiós')).toBe('https://wa.me/34600111222?text=Hola%20y%20adi%C3%B3s');
  });
});
