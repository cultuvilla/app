import {
  CONSENT_PROMPT_ACTIONS,
  EMPTY_PROMPT_STATE,
  isFlowRoute,
  localDayKey,
  noteConsentPromptAction,
  onConsentPromptAction,
  parsePromptState,
  promptReason,
  withAction,
  withAppDay,
  withUnansweredClose,
  type ConsentPromptState,
} from '../analyticsConsentPrompt';

const D1 = '2026-11-20';
const D2 = '2026-11-21';
const D3 = '2026-11-23';
const D4 = '2026-11-24';

const reason = (state: ConsentPromptState, today: string, answer: boolean | null | undefined = null, onboarded = true) =>
  promptReason({ answer, onboarded, state, today });

describe('promptReason', () => {
  it('asks after the first real action', () => {
    const s = withAction(withAppDay(EMPTY_PROMPT_STATE, D1));
    expect(reason(s, D1)).toBe('action');
  });

  it('does not ask someone who only looks, until the third distinct day', () => {
    let s = withAppDay(EMPTY_PROMPT_STATE, D1);
    s = withAppDay(s, D1);
    s = withAppDay(s, D2);
    expect(s.days).toEqual([D1, D2]);
    expect(reason(s, D2)).toBeNull();
    s = withAppDay(s, D3);
    expect(reason(s, D3)).toBe('day');
  });

  it('never asks once answered, yes or no, nor while the answer loads', () => {
    const s = withAction(withAppDay(withAppDay(withAppDay(EMPTY_PROMPT_STATE, D1), D2), D3));
    expect(reason(s, D3, true)).toBeNull();
    expect(reason(s, D3, false)).toBeNull();
    expect(promptReason({ answer: undefined, onboarded: true, state: s, today: D3 })).toBeNull();
  });

  it('never asks during onboarding', () => {
    expect(reason(withAction(EMPTY_PROMPT_STATE), D1, null, false)).toBeNull();
  });

  it('after one unanswered close asks again another day, and after a second never again', () => {
    let s = withAction(EMPTY_PROMPT_STATE);
    s = withUnansweredClose(s, D1);
    expect(reason(s, D1)).toBeNull();
    expect(reason(s, D2)).toBe('action');
    s = withUnansweredClose(s, D2);
    expect(reason(s, D3)).toBeNull();
    expect(reason(withAppDay(withAppDay(withAppDay(s, D1), D2), D3), D4)).toBeNull();
  });
});

describe('the day count', () => {
  it('stops at three days', () => {
    const s = [D1, D2, D3, D4].reduce(withAppDay, EMPTY_PROMPT_STATE);
    expect(s.days).toEqual([D1, D2, D3]);
  });

  it('keys a local calendar day', () => {
    expect(localDayKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });
});

describe('isFlowRoute', () => {
  it.each(['/crear/evento', '/completar-perfil', '/entrar/confirmar', '/aldea/palabra/nueva', '/aldea/lugar/x/editar'])(
    '%s is a flow',
    (p) => expect(isFlowRoute(p)).toBe(true),
  );
  it.each(['/', '/aldea', '/aldea/evento/fiesta_1', '/buzon', '/grupos/g1/registros/socios'])('%s is ordinary', (p) =>
    expect(isFlowRoute(p)).toBe(false),
  );
});

describe('parsePromptState', () => {
  it('round-trips and starts over on anything unreadable', () => {
    const s: ConsentPromptState = { days: [D1], acted: true, closes: 1, lastClosedOn: D1 };
    expect(parsePromptState(JSON.stringify(s))).toEqual(s);
    expect(parsePromptState(null)).toEqual(EMPTY_PROMPT_STATE);
    expect(parsePromptState('{nope')).toEqual(EMPTY_PROMPT_STATE);
    expect(parsePromptState('"x"')).toEqual(EMPTY_PROMPT_STATE);
  });
});

describe('the action list', () => {
  it('names each action once and reaches every listener', () => {
    expect(new Set(CONSENT_PROMPT_ACTIONS).size).toBe(CONSENT_PROMPT_ACTIONS.length);
    const heard: string[] = [];
    const off = onConsentPromptAction((a) => heard.push(a));
    noteConsentPromptAction('event-signup');
    off();
    noteConsentPromptAction('group-join');
    expect(heard).toEqual(['event-signup']);
  });
});
