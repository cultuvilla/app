import { effectiveRange, initialWrappedForm, wrappedFormRequest, type WrappedFormState } from '../wrappedForm';

const FIESTAS = [
  { id: 'carmen', name: 'Carmen', month: 8 },
  { id: 'santiago', name: 'Santiago', month: 7 },
  { id: 'pilar', name: 'El Pilar', month: 10 },
];
const TODAY = '2026-09-14';
const CONTEXT = { municipalityId: 'm1', year: 2026, today: TODAY, fiestas: FIESTAS };

function picked(): WrappedFormState {
  const state = initialWrappedForm(FIESTAS, TODAY, null);
  return {
    ...state,
    blocks: state.blocks.map((b) =>
      b.blockId === 'santiago'
        ? { ...b, range: { startDay: '2026-07-24', endDay: '2026-07-26' } }
        : b.blockId === 'carmen'
          ? { ...b, range: { startDay: '2026-08-14', endDay: '2026-08-28' } }
          : b,
    ),
  };
}

describe('initialWrappedForm', () => {
  it('lists blocks by month, on unless their month is still ahead, with no days guessed', () => {
    const state = initialWrappedForm(FIESTAS, TODAY, null);
    expect(state.blocks.map((b) => [b.blockId, b.enabled, b.range])).toEqual([
      ['santiago', true, null],
      ['carmen', true, null],
      ['pilar', false, null],
    ]);
    expect(state.customRange).toBeNull();
  });

  it('starts from the days of the year’s fiesta editions, on once they are over', () => {
    const state = initialWrappedForm(FIESTAS, TODAY, null, [
      { blockId: 'santiago', startDay: '2026-07-24', endDay: '2026-07-26' },
      { blockId: 'pilar', startDay: '2026-10-10', endDay: '2026-10-12' },
    ]);
    expect(state.blocks.map((b) => [b.blockId, b.enabled, b.range])).toEqual([
      ['santiago', true, { startDay: '2026-07-24', endDay: '2026-07-26' }],
      ['carmen', true, null],
      ['pilar', false, { startDay: '2026-10-10', endDay: '2026-10-12' }],
    ]);
  });

  it('starts a regeneration from the dates already built', () => {
    const state = initialWrappedForm(FIESTAS, TODAY, {
      blocks: [
        { blockId: 'carmen', name: 'Carmen', start: new Date('2026-08-13T22:00:00Z'), end: new Date('2026-08-28T21:59:59.999Z') },
      ],
      rangeStart: new Date('2026-07-14T22:00:00Z'),
      rangeEnd: new Date('2026-08-31T21:59:59.999Z'),
    });
    expect(state.blocks.find((b) => b.blockId === 'carmen')).toMatchObject({
      enabled: true,
      range: { startDay: '2026-08-14', endDay: '2026-08-28' },
    });
    expect(state.blocks.find((b) => b.blockId === 'santiago')?.enabled).toBe(false);
    expect(state.customRange).toEqual({ startDay: '2026-07-15', endDay: '2026-08-31' });
  });

  it('keeps following the blocks when the built range was exactly theirs', () => {
    const state = initialWrappedForm(FIESTAS, TODAY, {
      blocks: [
        { blockId: 'carmen', name: 'Carmen', start: new Date('2026-08-13T22:00:00Z'), end: new Date('2026-08-28T21:59:59.999Z') },
      ],
      rangeStart: new Date('2026-08-13T22:00:00Z'),
      rangeEnd: new Date('2026-08-28T21:59:59.999Z'),
    });
    expect(state.customRange).toBeNull();
  });
});

describe('effectiveRange', () => {
  it('follows the enabled blocks until one is picked by hand', () => {
    const state = picked();
    expect(effectiveRange(state)).toEqual({ startDay: '2026-07-24', endDay: '2026-08-28' });
    const noSantiago = { ...state, blocks: state.blocks.map((b) => (b.blockId === 'santiago' ? { ...b, enabled: false } : b)) };
    expect(effectiveRange(noSantiago)).toEqual({ startDay: '2026-08-14', endDay: '2026-08-28' });
    const custom = { startDay: '2026-07-15', endDay: '2026-08-31' };
    expect(effectiveRange({ ...state, customRange: custom })).toEqual(custom);
  });
});

describe('wrappedFormRequest', () => {
  it('builds the request for the enabled blocks only', () => {
    const result = wrappedFormRequest(picked(), CONTEXT);
    if (!result.ok) throw new Error(result.problem);
    expect(result.request).toEqual({
      municipalityId: 'm1',
      year: 2026,
      blocks: [
        { blockId: 'santiago', startDay: '2026-07-24', endDay: '2026-07-26' },
        { blockId: 'carmen', startDay: '2026-08-14', endDay: '2026-08-28' },
      ],
      range: { startDay: '2026-07-24', endDay: '2026-08-28' },
    });
  });

  it('asks for at least one fiesta', () => {
    const state = picked();
    const none = { ...state, blocks: state.blocks.map((b) => ({ ...b, enabled: false })) };
    expect(wrappedFormRequest(none, CONTEXT)).toEqual({ ok: false, problem: 'no-blocks' });
  });

  it('waits for the days of every enabled fiesta', () => {
    expect(wrappedFormRequest(initialWrappedForm(FIESTAS, TODAY, null), CONTEXT)).toEqual({
      ok: false,
      problem: 'missing-dates',
    });
  });

  it('refuses a hand-picked range that leaves a fiesta out, as the server would', () => {
    const state = { ...picked(), customRange: { startDay: '2026-08-01', endDay: '2026-08-31' } };
    expect(wrappedFormRequest(state, CONTEXT)).toEqual({ ok: false, problem: 'range-misses-block' });
  });
});
