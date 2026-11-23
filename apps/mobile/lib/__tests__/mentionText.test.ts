import { describe, expect, it } from '@jest/globals';
import {
  activeMentionQuery,
  adjustMentions,
  deleteMentionAt,
  insertMention,
  mentionRuns,
  splitMentionsAtCaret,
} from '../mentionText';
import type { MentionCandidate } from '@cultuvilla/shared/services/mentionCandidateService';
import type { NewsMention, NewsLink } from '@cultuvilla/shared/models/news/NewsPostDataModel';

const peña: MentionCandidate = { entityType: 'organization', entityId: 'org1', label: 'Peña El Barrio' };

function mention(offset: number, length: number, label = 'x'): NewsMention {
  return { entityType: 'place', entityId: 'p', label, offset, length };
}

function link(offset: number, length: number): NewsLink {
  return { url: 'https://x.com', offset, length };
}

describe('adjustMentions', () => {
  it('keeps spans entirely before the edit', () => {
    const m = [mention(0, 5)];
    // "hello world" -> "hello WORLD" edits after the span
    expect(adjustMentions('hello world', 'hello WORLD!', m)).toEqual(m);
  });

  it('shifts spans after an insertion', () => {
    const m = [mention(6, 5)]; // "world" in "hello world"
    const out = adjustMentions('hello world', 'oh hello world', m);
    expect(out[0]!.offset).toBe(9); // shifted by +3 ("oh ")
  });

  it('shifts spans left after a deletion before them', () => {
    const m = [mention(6, 5)];
    const out = adjustMentions('hello world', 'hi world', m);
    // "hello " (6) -> "hi " (3): delta -3
    expect(out[0]!.offset).toBe(3);
  });

  it('drops a span whose text was edited', () => {
    const m = [mention(6, 5)]; // "world"
    const out = adjustMentions('hello world', 'hello w0rld', m);
    expect(out).toEqual([]);
  });
});

describe('adjustMentions is generic over spans', () => {
  it('shifts a link span after an insertion, preserving url', () => {
    const out = adjustMentions('hello world', 'oh hello world', [link(6, 5)]);
    expect(out[0]).toEqual({ url: 'https://x.com', offset: 9, length: 5 });
  });
});

describe('splitMentionsAtCaret is generic over spans', () => {
  it('splits link spans at the caret and rebases the after side', () => {
    const { before, after } = splitMentionsAtCaret([link(0, 3), link(8, 4)], 5);
    expect(before).toEqual([link(0, 3)]);
    expect(after).toEqual([{ url: 'https://x.com', offset: 3, length: 4 }]);
  });
});

describe('activeMentionQuery', () => {
  it('detects an @query at the cursor', () => {
    const text = 'hola @Peñ';
    expect(activeMentionQuery(text, text.length, [])).toEqual({ query: 'Peñ', startIndex: 5 });
  });

  it('returns null for a mid-word @ (email)', () => {
    const text = 'mail me a@b';
    expect(activeMentionQuery(text, text.length, [])).toBeNull();
  });

  it('does not span a newline', () => {
    const text = '@foo\nbar';
    expect(activeMentionQuery(text, text.length, [])).toBeNull();
  });

  it('ignores an @ inside an already-committed mention', () => {
    const text = '@Peña El Barrio ';
    const committed: NewsMention[] = [
      { entityType: 'organization', entityId: 'o', label: 'Peña El Barrio', offset: 0, length: 15 },
    ];
    // cursor right after the committed span + trailing space
    expect(activeMentionQuery(text, 10, committed)).toBeNull();
  });
});

describe('splitMentionsAtCaret', () => {
  it('partitions spans around the caret and rebases the tail', () => {
    const m = [mention(2, 3), mention(10, 4)]; // one before caret 6, one after
    const { before, after } = splitMentionsAtCaret(m, 6);
    expect(before).toHaveLength(1);
    expect(before[0]!.offset).toBe(2);
    expect(after).toHaveLength(1);
    expect(after[0]!.offset).toBe(4); // 10 - 6
  });

  it('drops a span that straddles the caret', () => {
    const { before, after } = splitMentionsAtCaret([mention(4, 6)], 6);
    expect(before).toEqual([]);
    expect(after).toEqual([]);
  });
});

describe('insertMention', () => {
  it('replaces the @query with the bare label and records the span', () => {
    const text = 'hola @Peñ';
    const active = activeMentionQuery(text, text.length, [])!;
    const res = insertMention(text, [], active, peña);
    expect(res.text).toBe('hola Peña El Barrio ');
    expect(res.mentions).toHaveLength(1);
    expect(res.mentions[0]).toMatchObject({ entityId: 'org1', offset: 5, length: 'Peña El Barrio'.length });
    // caret lands just after the inserted label + trailing space
    expect(res.cursor).toBe(5 + 'Peña El Barrio'.length + 1);
  });

  it('shifts a later mention when inserting before it', () => {
    const text = '@A end';
    const existing: NewsMention[] = [{ entityType: 'place', entityId: 'p', label: 'end', offset: 3, length: 3 }];
    const active = { query: 'A', startIndex: 0 };
    const res = insertMention(text, existing, active, peña);
    const shifted = res.mentions.find((m) => m.entityId === 'p')!;
    expect(shifted.offset).toBeGreaterThan(3);
  });
});

describe('mentionRuns', () => {
  it('splits text into plain and mention runs', () => {
    const m = [mention(5, 3, 'abc')]; // "abc" in "hola abc!"
    expect(mentionRuns('hola abc!', m)).toEqual([
      { text: 'hola ' },
      { text: 'abc', mention: m[0] },
      { text: '!' },
    ]);
  });

  it('skips an out-of-range span but keeps the prose', () => {
    const m = [mention(20, 3)];
    expect(mentionRuns('short', m)).toEqual([{ text: 'short' }]);
  });

  it('skips a span overlapping an earlier one', () => {
    const a = mention(0, 4, 'aaaa');
    const b = mention(2, 4, 'bbbb'); // overlaps a
    expect(mentionRuns('aaaabbbb', [a, b])).toEqual([
      { text: 'aaaa', mention: a },
      { text: 'bbbb' },
    ]);
  });

  it('emits a mention run with no trailing prose when the mention ends the text', () => {
    const m = [mention(5, 3, 'abc')]; // "abc" ends "hola abc"
    expect(mentionRuns('hola abc', m)).toEqual([
      { text: 'hola ' },
      { text: 'abc', mention: m[0] },
    ]);
  });
});

describe('deleteMentionAt', () => {
  // "hola Peña mundo" with "Peña" (offset 5, length 4) a mention
  const text = 'hola Peña mundo';
  const m = [mention(5, 4, 'Peña')];

  it('Backspace at the end of a mention removes the whole span', () => {
    const res = deleteMentionAt(text, m, 9, 'backward');
    expect(res).toEqual({ text: 'hola  mundo', mentions: [], cursor: 5 });
  });

  it('Delete at the start of a mention removes the whole span', () => {
    const res = deleteMentionAt(text, m, 5, 'forward');
    expect(res).toEqual({ text: 'hola  mundo', mentions: [], cursor: 5 });
  });

  it('shifts a later mention left after the removed span', () => {
    const two = [mention(5, 4, 'Peña'), mention(10, 5, 'mundo')];
    const res = deleteMentionAt(text, two, 9, 'backward')!;
    expect(res.mentions).toEqual([{ ...two[1], offset: 6 }]); // 10 - 4
  });

  it('returns null when the caret is not at a mention edge', () => {
    expect(deleteMentionAt(text, m, 2, 'backward')).toBeNull();
    expect(deleteMentionAt(text, m, 7, 'backward')).toBeNull(); // inside the span
  });

  it('removes only the touched mention when two are adjacent', () => {
    // "ab" (offset 0, len 2) immediately followed by "cd" (offset 2, len 2)
    const adjacent = [mention(0, 2, 'ab'), mention(2, 2, 'cd')];
    // Backspace at the shared boundary (caret 2) targets the FIRST mention's end
    const back = deleteMentionAt('abcd', adjacent, 2, 'backward')!;
    expect(back).toEqual({ text: 'cd', mentions: [{ ...adjacent[1], offset: 0 }], cursor: 0 });
    // Delete at the shared boundary (caret 2) targets the SECOND mention's start
    const fwd = deleteMentionAt('abcd', adjacent, 2, 'forward')!;
    expect(fwd).toEqual({ text: 'ab', mentions: [adjacent[0]], cursor: 2 });
  });
});
