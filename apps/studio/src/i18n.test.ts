import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { t } from './i18n';

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) && !name.endsWith('.test.ts') ? [path] : [];
  });
}

describe('studio messages', () => {
  it('finds every literal key the studio asks for in the catalog', () => {
    const keys = sources(__dirname).flatMap((file) =>
      [...readFileSync(file, 'utf8').matchAll(/\bt\(\s*'([a-zA-Z0-9_.]+)'/g)].map((m) => m[1] as string),
    );
    expect(keys.length).toBeGreaterThan(20);
    expect(keys.filter((key) => t(key) === key)).toEqual([]);
  });

  it('fills placeholders', () => {
    expect(t('studio.web.articles.updated', { date: '24/10/2026' })).toBe('Editado 24/10/2026');
  });
});
