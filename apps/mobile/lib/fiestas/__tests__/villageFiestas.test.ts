import type { FiestaEdition } from '@cultuvilla/shared/models';
import { fiestasHomeCard, namedEditions, undatedBlocks } from '../villageFiestas';

const fiestas = [
  { id: 'santiago', name: 'Santiago', month: 7 },
  { id: 'carmen', name: 'Carmen', month: 8 },
];

function edition(blockId: string, year: number, startDay: string, endDay: string): FiestaEdition {
  return {
    id: `m1_${blockId}_${String(year)}`,
    municipalityId: 'm1',
    villageSlug: 'villa',
    blockId,
    year,
    startDay,
    endDay,
    proposedBy: 'u1',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('namedEditions', () => {
  it('names each edition after its block and drops one whose block is gone', () => {
    const named = namedEditions(
      [edition('carmen', 2026, '2026-08-14', '2026-08-17'), edition('gone', 2026, '2026-06-01', '2026-06-02'), edition('santiago', 2026, '2026-07-24', '2026-07-26')],
      fiestas,
    );
    expect(named.map((e) => [e.blockId, e.block.name])).toEqual([
      ['santiago', 'Santiago'],
      ['carmen', 'Carmen'],
    ]);
  });
});

describe('fiestasHomeCard', () => {
  const named = namedEditions([edition('santiago', 2026, '2026-07-24', '2026-07-26'), edition('carmen', 2026, '2026-08-14', '2026-08-17')], fiestas);

  it('announces the next edition within the lead time', () => {
    expect(fiestasHomeCard(fiestas, named, '2026-07-01', false)).toMatchObject({ kind: 'programme', phase: 'upcoming', daysToGo: 23, edition: { blockId: 'santiago' } });
  });

  it('says nothing to a visitor months ahead', () => {
    expect(fiestasHomeCard(fiestas, named, '2026-03-01', false)).toBeNull();
  });

  it('shows the running edition over an upcoming one', () => {
    expect(fiestasHomeCard(fiestas, named, '2026-07-25', false)).toMatchObject({ kind: 'programme', phase: 'running', edition: { blockId: 'santiago' } });
  });

  it('moves on to the next edition once one is over', () => {
    expect(fiestasHomeCard(fiestas, named, '2026-07-27', false)).toMatchObject({ kind: 'programme', edition: { blockId: 'carmen' } });
  });

  it('asks a member to date a block due this month or next', () => {
    expect(fiestasHomeCard(fiestas, [], '2026-06-10', true)).toEqual({ kind: 'propose', block: fiestas[0], year: 2026 });
    expect(fiestasHomeCard(fiestas, [], '2026-06-10', false)).toBeNull();
    expect(fiestasHomeCard(fiestas, [], '2026-04-10', true)).toBeNull();
  });

  it('asks about January’s fiestas in December, for next year', () => {
    const reyes = [{ id: 'reyes', name: 'Reyes', month: 1 }];
    expect(fiestasHomeCard(reyes, [], '2026-12-05', true)).toEqual({ kind: 'propose', block: reyes[0], year: 2027 });
  });

  it('lists the year’s undated blocks in month order', () => {
    expect(undatedBlocks(fiestas, named.slice(0, 1), 2026).map((f) => f.id)).toEqual(['carmen']);
    expect(undatedBlocks(fiestas, named, 2027).map((f) => f.id)).toEqual(['santiago', 'carmen']);
  });
});
