import {
  STORY_CARD_MS,
  barFill,
  startAt,
  step,
  tapDirection,
  tick,
} from '../storyProgress';

// Three cards and the closing screen after them (index 3).
const COUNT = 3;

describe('story progress', () => {
  it('starts on the asked card, clamped into range', () => {
    expect(startAt(1, COUNT)).toEqual({ index: 1, elapsed: 0 });
    expect(startAt(9, COUNT)).toEqual({ index: COUNT - 1, elapsed: 0 });
    expect(startAt(-1, COUNT)).toEqual({ index: 0, elapsed: 0 });
  });

  it('moves on by itself once a card has been up long enough', () => {
    const almost = tick(startAt(0, COUNT), STORY_CARD_MS - 10, COUNT);
    expect(almost).toEqual({ index: 0, elapsed: STORY_CARD_MS - 10 });
    expect(tick(almost, 20, COUNT)).toEqual({ index: 1, elapsed: 0 });
  });

  // The closing screen holds the share and village actions — it must wait for
  // the reader, not run out from under them.
  it('stops on the closing screen', () => {
    const last = tick(startAt(COUNT - 1, COUNT), STORY_CARD_MS, COUNT);
    expect(last).toEqual({ index: COUNT, elapsed: 0 });
    expect(tick(last, STORY_CARD_MS * 5, COUNT)).toBe(last);
  });

  it('steps forward and back, restarting the card it lands on', () => {
    const mid = { index: 1, elapsed: 1234 };
    expect(step(mid, 1, COUNT)).toEqual({ index: 2, elapsed: 0 });
    expect(step(mid, -1, COUNT)).toEqual({ index: 0, elapsed: 0 });
    expect(step({ index: 0, elapsed: 500 }, -1, COUNT)).toEqual({ index: 0, elapsed: 0 });
    expect(step({ index: COUNT, elapsed: 0 }, 1, COUNT)).toEqual({ index: COUNT, elapsed: 0 });
  });

  it('fills the bars behind the current card, part of its own, none ahead', () => {
    const s = { index: 1, elapsed: STORY_CARD_MS / 2 };
    expect([0, 1, 2].map((i) => barFill(s, i))).toEqual([1, 0.5, 0]);
    expect([0, 1, 2].map((i) => barFill({ index: COUNT, elapsed: 0 }, i))).toEqual([1, 1, 1]);
  });

  it('reads a tap on the left third as back, anywhere else as forward', () => {
    expect(tapDirection(50, 300)).toBe(-1);
    expect(tapDirection(99, 300)).toBe(-1);
    expect(tapDirection(100, 300)).toBe(1);
    expect(tapDirection(290, 300)).toBe(1);
  });
});
