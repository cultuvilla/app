import { describe, it, expect } from 'vitest';
import {
  buildLedgerCategoryData,
  ledgerCategoryChoices,
  ledgerCategoryIdFor,
  MAX_LEDGER_CATEGORY_NAME,
} from '../../src/models/organization/LedgerCategoryDataModel';

describe('ledgerCategoryIdFor', () => {
  it('is the same id for one name in any case or spacing, per kind', () => {
    expect(ledgerCategoryIdFor('expense', ' Fiestas ')).toBe(ledgerCategoryIdFor('expense', 'FIESTAS'));
    expect(ledgerCategoryIdFor('expense', 'Bar  de fiestas')).toBe(ledgerCategoryIdFor('expense', 'bar de fiestas'));
    expect(ledgerCategoryIdFor('income', 'Fiestas')).not.toBe(ledgerCategoryIdFor('expense', 'Fiestas'));
  });

  it('never yields a slash, and stays far under the 1500-byte id limit', () => {
    expect(ledgerCategoryIdFor('expense', 'Luz / agua')).not.toContain('/');
    const longest = ledgerCategoryIdFor('expense', '𝄞'.repeat(MAX_LEDGER_CATEGORY_NAME / 2));
    expect(new TextEncoder().encode(longest).length).toBeLessThan(1500);
    expect(ledgerCategoryIdFor('expense', '..')).toBe('expense_..');
  });
});

describe('buildLedgerCategoryData', () => {
  it('stores the cleaned name', () => {
    expect(buildLedgerCategoryData({ name: '  Lotería   de Navidad ', kind: 'income', createdBy: 'u1' })).toMatchObject({
      name: 'Lotería de Navidad',
      kind: 'income',
      createdBy: 'u1',
    });
  });
});

describe('ledgerCategoryChoices', () => {
  const categories = [
    { name: 'Orquesta', kind: 'expense' as const },
    { name: 'Bar', kind: 'expense' as const },
    { name: 'Lotería', kind: 'income' as const },
  ];
  const past = [
    { kind: 'expense' as const, category: 'bar' },
    { kind: 'expense' as const, category: 'Seguro' },
    { kind: 'expense' as const, category: 'seguro' },
    { kind: 'expense' as const, category: null },
    { kind: 'income' as const, category: 'Rifa' },
  ];

  it('offers the stored categories of the kind, then the past names not stored yet', () => {
    expect(ledgerCategoryChoices(categories, past, 'expense')).toEqual([
      { name: 'Bar', stored: true },
      { name: 'Orquesta', stored: true },
      { name: 'Seguro', stored: false },
    ]);
    expect(ledgerCategoryChoices(categories, past, 'income')).toEqual([
      { name: 'Lotería', stored: true },
      { name: 'Rifa', stored: false },
    ]);
  });

  it('is empty for a group with no categories and no past entries', () => {
    expect(ledgerCategoryChoices([], [], 'expense')).toEqual([]);
  });
});
