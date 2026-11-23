import { isSocioGroupMessageInput } from '@cultuvilla/shared/models/organization';
import { composerInput, emptyComposerForm, socioAvisoInput } from '../messaging';

const ids = { orgId: 'org1', messageId: 'Msg0000000001' };
const yesNo: [string, string] = ['Sí', 'No'];

describe('socioAvisoInput', () => {
  it('builds exactly what the server lets a socio send', () => {
    const out = socioAvisoInput({ title: ' Se vende leña ', body: ' Preguntad por Paco ' }, ids);
    expect(out).toEqual({
      input: {
        ...ids,
        title: 'Se vende leña',
        body: 'Preguntad por Paco',
        audience: { kind: 'all', eventId: null },
        channels: { push: true, email: false, whatsapp: 'none' },
        pinned: false,
        poll: null,
      },
    });
    expect('input' in out && isSocioGroupMessageInput(out.input)).toBe(true);
  });

  it('asks for the subject, then the text', () => {
    expect(socioAvisoInput({ title: ' ', body: 'x' }, ids)).toEqual({ error: 'subject' });
    expect(socioAvisoInput({ title: 'x', body: ' ' }, ids)).toEqual({ error: 'body' });
  });
});

describe('composerInput', () => {
  it('builds the callable input from a plain message', () => {
    const out = composerInput({ ...emptyComposerForm(), title: ' Asamblea ', body: ' El sábado ' }, ids, yesNo);
    expect(out).toEqual({
      input: {
        ...ids,
        title: 'Asamblea',
        body: 'El sábado',
        audience: { kind: 'all', eventId: null },
        channels: { push: true, email: true, whatsapp: 'fallback' },
        pinned: false,
        poll: null,
      },
    });
  });

  it('asks for the subject, the body and the event in that order', () => {
    expect(composerInput(emptyComposerForm(), ids, yesNo)).toEqual({ error: 'subject' });
    expect(composerInput({ ...emptyComposerForm(), title: 'x' }, ids, yesNo)).toEqual({ error: 'body' });
    expect(composerInput({ ...emptyComposerForm(), title: 'x', body: 'y', audience: 'event' }, ids, yesNo)).toEqual({ error: 'event' });
  });

  it('a yes/no poll stores the localized answers; a choice poll drops blank options', () => {
    const base = { ...emptyComposerForm(), title: 'x', body: 'y', question: '¿Vienes?' };
    const yn = composerInput({ ...base, poll: 'yes_no' }, ids, yesNo);
    expect('input' in yn && yn.input.poll).toEqual({ question: '¿Vienes?', kind: 'yes_no', options: ['Sí', 'No'] });
    const choice = composerInput({ ...base, poll: 'choice', options: ['12', ' ', '19'] }, ids, yesNo);
    expect('input' in choice && choice.input.poll).toEqual({ question: '¿Vienes?', kind: 'choice', options: ['12', '19'] });
    expect(composerInput({ ...base, poll: 'choice', options: ['12', ''] }, ids, yesNo)).toEqual({ error: 'poll' });
  });

  it('keeps the event id only for the event audience', () => {
    const out = composerInput({ ...emptyComposerForm(), title: 'x', body: 'y', audience: 'junta', eventId: 'ev1' }, ids, yesNo);
    expect('input' in out && out.input.audience).toEqual({ kind: 'junta', eventId: null });
  });
});
