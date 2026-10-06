// The two PR-time breaking-change detectors: pure parsing, then end-to-end
// through throwaway git repos — every past false positive of the ordago
// original was a git-range bug, not a parsing bug, so the range handling is
// tested for real.

import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  classifySchemaChange,
  clientReachableNames,
  definitionKind,
  isBackfillScriptPath,
  isPreDeployBackfill,
  isStoredSchemaFile,
  parseBreakingTrailers,
  parseExemptTrailers,
  parseIndexExports,
} from '../lib/breaking-change.mjs';

const SCRIPTS = path.resolve(fileURLToPath(import.meta.url), '../..');

describe('trailers', () => {
  it('reads Breaking-Client and Breaking-Client-Exempt separately', () => {
    const msgs = ['feat: x\n\nBreaking-Client: old builds call it', 'chore: y\n\nBreaking-Client-Exempt: nobody calls it'];
    assert.deepEqual(parseBreakingTrailers(msgs), ['old builds call it']);
    assert.deepEqual(parseExemptTrailers(msgs), ['nobody calls it']);
  });

  it('an exempt trailer is never read as a breaking one — it must not raise the wall', () => {
    assert.deepEqual(parseBreakingTrailers(['x\n\nBreaking-Client-Exempt: dead']), []);
  });

  it('ignores an empty trailer value', () => {
    assert.deepEqual(parseBreakingTrailers(['x\n\nBreaking-Client:   ']), []);
  });
});

describe('callable parsing', () => {
  const index = `import './initApp';
export { a } from './x/a';
export { b as renamedB } from './x/b';
export {
  t1,
  t2, // a comment
} from './x/triggers';
`;

  it('parses single, aliased and multi-line export blocks', () => {
    assert.deepEqual(parseIndexExports(index), [
      { exported: 'a', local: 'a', from: './x/a' },
      { exported: 'renamedB', local: 'b', from: './x/b' },
      { exported: 't1', local: 't1', from: './x/triggers' },
      { exported: 't2', local: 't2', from: './x/triggers' },
    ]);
  });

  it('reads the v2 builder, generics and a type annotation included', () => {
    assert.equal(definitionKind('export const a = onCall<In, Out>(opts, h)', 'a'), 'onCall');
    assert.equal(definitionKind('export const a: X = onRequest((q, r) => {})', 'a'), 'onRequest');
    assert.equal(definitionKind('export const a = onDocumentWritten("x", h)', 'a'), 'onDocumentWritten');
    assert.equal(definitionKind('export const ab = onCall(h)', 'a'), null);
  });

  it('keeps callables and HTTPS endpoints, drops triggers, and counts the unreadable', () => {
    const modules = {
      './x/a': 'export const a = onCall(h)',
      './x/b': 'export const b = onRequest(h)',
      './x/triggers': 'export const t1 = onDocumentCreated("x", h);\nexport const t2 = wrap(h);',
    };
    assert.deepEqual(clientReachableNames(index, (from) => modules[from] ?? null), ['a', 'renamedB', 't2']);
  });

  it('reads a local trigger factory through the module imports', () => {
    const idx = "export { c1 } from './x/c';";
    const triggerFactory = "import { onDocumentWritten, type Change } from 'firebase-functions/v2/firestore';\nexport const c1 = cleanupTrigger(src);";
    const callableFactory = "import { onCall } from 'firebase-functions/v2/https';\nexport const c1 = guarded(h);";
    assert.deepEqual(clientReachableNames(idx, () => triggerFactory), []);
    assert.deepEqual(clientReachableNames(idx, () => callableFactory), ['c1']);
  });
});

describe('stored schema scope', () => {
  it('covers models, not form schemas, indexes or tests', () => {
    assert.equal(isStoredSchemaFile('packages/shared/src/models/event/EventDataModel.ts'), true);
    assert.equal(isStoredSchemaFile('packages/shared/src/models/event/EventFormSchema.ts'), false);
    assert.equal(isStoredSchemaFile('packages/shared/src/models/event/index.ts'), false);
    assert.equal(isStoredSchemaFile('packages/shared/src/services/eventService.ts'), false);
  });

  it('recognises a registered pre-deploy backfill only', () => {
    assert.equal(isPreDeployBackfill(backfillSource('pre-deploy')), true);
    assert.equal(isPreDeployBackfill(backfillSource('post-deploy')), false);
    assert.equal(isPreDeployBackfill("const phase = 'pre-deploy';"), false);
  });

  it('a pre-deploy meta off the harness is not registered, so the deploy gate never sees it', () => {
    assert.equal(isPreDeployBackfill("export const meta = { id: 'x', phase: 'pre-deploy' };"), false);
  });

  it('looks for backfills where the registry discovers them', () => {
    assert.equal(isBackfillScriptPath('scripts/backfill-x.mjs'), true);
    assert.equal(isBackfillScriptPath('scripts/backfill/x.mjs'), true);
    assert.equal(isBackfillScriptPath('scripts/lib/x.mjs'), false);
    assert.equal(isBackfillScriptPath('scripts/backfill/nested/x.mjs'), false);
    assert.equal(isBackfillScriptPath('scripts/lint-backfill-meta.mjs'), false);
    assert.equal(isBackfillScriptPath('other/backfill-x.mjs'), false);
  });
});

/** A unified -U0 diff for a whole-file before/after pair, via git itself. */
function diffOf(before, after) {
  const dir = mkdtempSync(path.join(tmpdir(), 'schema-diff-'));
  try {
    writeFileSync(path.join(dir, 'a.ts'), before);
    writeFileSync(path.join(dir, 'b.ts'), after);
    try {
      return execFileSync('git', ['diff', '--no-index', '-U0', 'a.ts', 'b.ts'], { cwd: dir, encoding: 'utf8' });
    } catch (err) {
      return err.stdout; // exit 1 = files differ
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const backfillSource = (phase) =>
  `export const meta = { id: 'thing-b', phase: '${phase}' };\nexport async function run() {}\nif (isMain(import.meta.url)) await runBackfill({ meta, run });\n`;

const schema = (fields) => `import { z } from 'zod';\n\nexport const XSchema = z.object({\n${fields.map((f) => `  ${f},`).join('\n')}\n});\n`;
const classify = (beforeFields, afterFields) => {
  const before = schema(beforeFields);
  const after = schema(afterFields);
  return classifySchemaChange({ before, after, diff: diffOf(before, after) });
};

describe('classifySchemaChange', () => {
  it('a new required field tightens', () => {
    assert.deepEqual(classify(['a: z.string()'], ['a: z.string()', 'b: z.number()']), {
      tightened: ['b: new required field'],
      loosened: [],
    });
  });

  it('a new nullable-but-required field tightens — the key must exist', () => {
    assert.equal(classify(['a: z.string()'], ['a: z.string()', 'b: z.string().nullable()']).tightened.length, 1);
  });

  it('a new optional or defaulted field is an expand, not a break', () => {
    assert.deepEqual(classify(['a: z.string()'], ['a: z.string()', 'b: z.number().optional()', 'c: z.boolean().default(false)']), {
      tightened: [],
      loosened: [],
    });
  });

  it('a multi-line optional field is read whole', () => {
    assert.deepEqual(classify(['a: z.string()'], ['a: z.string()', 'b: z\n    .number()\n    .optional()']).tightened, []);
  });

  it('a field referencing another schema counts', () => {
    assert.deepEqual(classify(['a: z.string()'], ['a: z.string()', 'loc: LocationSchema']).tightened, ['loc: new required field']);
  });

  it('required keys inside a new optional nested object are not required fields', () => {
    assert.deepEqual(classify(['a: z.string()'], ['a: z.string()', 'stats: z\n    .object({\n      n: z.number(),\n    })\n    .optional()']), {
      tightened: [],
      loosened: [],
    });
  });

  it('losing .optional() or .nullable() tightens', () => {
    assert.deepEqual(classify(['a: z.string().optional()', 'b: z.string().nullable()'], ['a: z.string()', 'b: z.string()']).tightened, [
      'a: no longer optional',
      'b: no longer nullable',
    ]);
  });

  it('removing a required field, or making it optional, loosens', () => {
    assert.deepEqual(classify(['a: z.string()', 'b: z.number()', 'c: z.string()'], ['a: z.string()', 'c: z.string().optional()']), {
      tightened: [],
      loosened: ['c: became optional', 'b: required field removed'],
    });
  });

  it('removing an optional field is harmless to old clients', () => {
    assert.deepEqual(classify(['a: z.string()', 'b: z.number().optional()'], ['a: z.string()']).loosened, []);
  });

  it('a moved or reformatted field is neither', () => {
    assert.deepEqual(classify(['a: z.string()', 'b: z.number()'], ['b:   z.number()', 'a: z.string()']), {
      tightened: [],
      loosened: [],
    });
  });

  it('a new .strict() tightens', () => {
    const before = schema(['a: z.object({})']);
    const after = schema(['a: z.object({}).strict()']);
    assert.ok(classifySchemaChange({ before, after, diff: diffOf(before, after) }).tightened.includes('.strict() added: unknown keys now throw'));
  });

  it('an edited declaration line does not hide the field changes inside it', () => {
    const before = schema(['a: z.string()']);
    const after = schema(['a: z.string()', 'b: z.number()']).replace('z.object({', 'z.object({ // things');
    assert.deepEqual(classifySchemaChange({ before, after, diff: diffOf(before, after) }), {
      tightened: ['b: new required field'],
      loosened: [],
    });
  });

  it('an edited declaration line does not hide a field removed inside it', () => {
    const before = schema(['a: z.string()', 'b: z.number()']);
    const after = schema(['a: z.string()']).replace('z.object({', 'z.object({ // things');
    assert.deepEqual(classifySchemaChange({ before, after, diff: diffOf(before, after) }).loosened, ['b: required field removed']);
  });

  it('an edited nested-object line does not hide a required key added inside it', () => {
    const nested = (keys) => `stats: z.object({\n${keys.map((k) => `    ${k},`).join('\n')}\n  })`;
    const before = schema(['a: z.string()', nested(['n: z.number()'])]);
    const after = schema(['a: z.string()', nested(['n: z.number()', 'm: z.number()'])]).replace('stats: z.object({', 'stats: z.object({ // counters');
    assert.deepEqual(classifySchemaChange({ before, after, diff: diffOf(before, after) }).tightened, ['m: new required field']);
  });

  it('an edited declaration whose every field changed is not read as added whole', () => {
    const before = schema(['a: z.string()']);
    const after = schema(['b: z.number()']).replace('z.object({', 'z.object({ // things');
    assert.deepEqual(classifySchemaChange({ before, after, diff: diffOf(before, after) }), {
      tightened: ['b: new required field'],
      loosened: ['a: required field removed'],
    });
  });

  it('an edited nested object whose only key changed is not read as added whole', () => {
    const before = schema(['a: z.string()', 'stats: z.object({\n    n: z.number().optional(),\n  })']);
    const after = schema(['a: z.string()', 'stats: z.object({ // counters\n    n: z.number(),\n  })']);
    assert.deepEqual(classifySchemaChange({ before, after, diff: diffOf(before, after) }).tightened, ['n: no longer optional']);
  });

  it("a nested key's .optional() does not make the field containing it optional", () => {
    const nested = 'stats: z.object({\n    n: z.number().optional(),\n  })';
    assert.deepEqual(classify(['a: z.string()', nested], ['a: z.string()']).loosened, ['stats: required field removed']);
    assert.deepEqual(classify(['a: z.string()'], ['a: z.string()', nested]).tightened, ['stats: new required field']);
  });

  it('a new strict sub-schema is not a tightening of the existing ones', () => {
    const before = schema(['a: z.string()']);
    const after = `${before}\nexport const SubSchema = z\n  .object({\n    n: z.number(),\n  })\n  .strict();\n`;
    assert.deepEqual(classifySchemaChange({ before, after, diff: diffOf(before, after) }).tightened, []);
  });

  it('a new optional strict nested object is an expand, not a break', () => {
    const before = schema(['a: z.string()']);
    const after = schema(['a: z.string()', 'meta: z\n    .object({\n      n: z.number(),\n    })\n    .strict()\n    .optional()']);
    assert.deepEqual(classifySchemaChange({ before, after, diff: diffOf(before, after) }), { tightened: [], loosened: [] });
  });

  it('.strict() on an unchanged line elsewhere is not counted against this change', () => {
    const before = `${schema(['a: z.string()'])}\nexport const S = z.object({}).strict();\n`;
    const after = `${schema(['a: z.string()', 'b: z.string().optional()'])}\nexport const S = z.object({}).strict();\n`;
    assert.deepEqual(classifySchemaChange({ before, after, diff: diffOf(before, after) }).tightened, []);
  });

  it('a quoted key carrying regex specials is read, not thrown on', () => {
    assert.deepEqual(classify(['a: z.string()'], ['a: z.string()', "'a[b': z.number()", "'c(d)+': z.number().optional()"]), {
      tightened: ['a[b: new required field'],
      loosened: [],
    });
    assert.deepEqual(classify(['a: z.string()', "'x.y': z.number()"], ['a: z.string()']).loosened, ['x.y: required field removed']);
  });

  it('the keys of a whole new schema constant only count through the field that uses it', () => {
    const before = schema(['a: z.string()']);
    const after = `${before}\nexport const NewSchema = z.object({\n  n: z.number(),\n});\n`;
    assert.deepEqual(classifySchemaChange({ before, after, diff: diffOf(before, after) }).tightened, []);
  });
});

// ---------------------------------------------------------------------------
// End-to-end through git
// ---------------------------------------------------------------------------

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' });

function newRepo() {
  const repo = mkdtempSync(path.join(tmpdir(), 'breaking-guard-'));
  git(repo, 'init', '-q', '-b', 'main');
  git(repo, 'config', 'user.email', 'test@example.com');
  git(repo, 'config', 'user.name', 'Test');
  git(repo, 'config', 'commit.gpgsign', 'false');
  return repo;
}

function write(repo, rel, content) {
  mkdirSync(path.dirname(path.join(repo, rel)), { recursive: true });
  writeFileSync(path.join(repo, rel), content);
}

function commit(repo, message) {
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '--allow-empty', '-m', message);
}

function run(repo, script, base = 'base-ref') {
  try {
    const out = execFileSync('node', [path.join(SCRIPTS, script), `--base=${base}`, '--head=HEAD'], {
      cwd: repo,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, out };
  } catch (err) {
    return { code: err.status ?? 1, out: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
}

function writeCallables(repo, { callables = [], triggers = [] }) {
  const names = [...callables, ...triggers];
  write(repo, 'functions/src/index.ts', names.map((n) => `export { ${n} } from './fns/${n}';`).join('\n') + '\n');
  for (const n of callables) write(repo, `functions/src/fns/${n}.ts`, `export const ${n} = onCall(async () => ({}));\n`);
  for (const n of triggers) write(repo, `functions/src/fns/${n}.ts`, `export const ${n} = onDocumentCreated('x/{id}', async () => {});\n`);
}

const repos = [];
after(() => repos.forEach((r) => rmSync(r, { recursive: true, force: true })));
const repo = () => {
  const r = newRepo();
  repos.push(r);
  return r;
};

describe('check-callable-removal', () => {
  it('fails an undeclared callable removal and names it', () => {
    const r = repo();
    writeCallables(r, { callables: ['alpha', 'beta'] });
    commit(r, 'base');
    git(r, 'branch', 'base-ref');
    writeCallables(r, { callables: ['alpha'] });
    commit(r, 'feat: drop beta');
    const { code, out } = run(r, 'check-callable-removal.mjs');
    assert.equal(code, 1, out);
    assert.match(out, /beta/);
  });

  it('a rename is a removal of the old name', () => {
    const r = repo();
    writeCallables(r, { callables: ['alpha'] });
    commit(r, 'base');
    git(r, 'branch', 'base-ref');
    write(r, 'functions/src/index.ts', "export { alpha as alphaV2 } from './fns/alpha';\n");
    commit(r, 'refactor: rename');
    const { code, out } = run(r, 'check-callable-removal.mjs');
    assert.equal(code, 1, out);
    assert.match(out, /alpha/);
  });

  it('removing a trigger is not client-breaking', () => {
    const r = repo();
    writeCallables(r, { callables: ['alpha'], triggers: ['onThing'] });
    commit(r, 'base');
    git(r, 'branch', 'base-ref');
    writeCallables(r, { callables: ['alpha'] });
    commit(r, 'chore: drop trigger');
    assert.equal(run(r, 'check-callable-removal.mjs').code, 0);
  });

  it('a trailer on any commit of the branch declares it, not only the tip', () => {
    const r = repo();
    writeCallables(r, { callables: ['alpha', 'beta'] });
    commit(r, 'base');
    git(r, 'branch', 'base-ref');
    writeCallables(r, { callables: ['alpha'] });
    commit(r, 'feat: drop beta\n\nBreaking-Client: 1.2 calls beta');
    write(r, 'README.md', 'x\n');
    commit(r, 'docs: follow-up');
    const { code, out } = run(r, 'check-callable-removal.mjs');
    assert.equal(code, 0, out);
    assert.match(out, /Breaking-Client/);
  });

  it('an exempt trailer passes without declaring a break', () => {
    const r = repo();
    writeCallables(r, { callables: ['alpha', 'beta'] });
    commit(r, 'base');
    git(r, 'branch', 'base-ref');
    writeCallables(r, { callables: ['alpha'] });
    commit(r, 'chore: drop beta\n\nBreaking-Client-Exempt: last caller shipped below minSupported');
    const { code, out } = run(r, 'check-callable-removal.mjs');
    assert.equal(code, 0, out);
    assert.match(out, /no wall/);
  });

  it('does not blame the branch for a callable the base gained after divergence', () => {
    const r = repo();
    writeCallables(r, { callables: ['alpha'] });
    commit(r, 'base');
    git(r, 'checkout', '-q', '-b', 'feature');
    write(r, 'README.md', 'x\n');
    commit(r, 'docs: unrelated');
    git(r, 'checkout', '-q', 'main');
    writeCallables(r, { callables: ['alpha', 'gamma'] });
    commit(r, 'feat: gamma lands on base');
    git(r, 'branch', 'base-ref');
    git(r, 'checkout', '-q', 'feature');
    const { code, out } = run(r, 'check-callable-removal.mjs');
    assert.equal(code, 0, out);
  });

  it('fails loudly, not falsely, when there is no merge-base', () => {
    const r = repo();
    writeCallables(r, { callables: ['alpha'] });
    commit(r, 'base');
    git(r, 'checkout', '-q', '--orphan', 'other');
    commit(r, 'unrelated root');
    git(r, 'branch', 'base-ref');
    git(r, 'checkout', '-q', 'main');
    const { code, out } = run(r, 'check-callable-removal.mjs');
    assert.equal(code, 1);
    assert.match(out, /merge-base/);
  });
});

const MODEL = 'packages/shared/src/models/thing/ThingDataModel.ts';

describe('check-schema-change', () => {
  function baseRepo() {
    const r = repo();
    write(r, MODEL, schema(['a: z.string()']));
    commit(r, 'base');
    git(r, 'branch', 'base-ref');
    return r;
  }

  it('fails a new required field with no backfill', () => {
    const r = baseRepo();
    write(r, MODEL, schema(['a: z.string()', 'b: z.number()']));
    commit(r, 'feat: b');
    const { code, out } = run(r, 'check-schema-change.mjs');
    assert.equal(code, 1, out);
    assert.match(out, /b: new required field/);
  });

  it('passes it when a pre-deploy backfill ships in the same PR', () => {
    const r = baseRepo();
    write(r, MODEL, schema(['a: z.string()', 'b: z.number()']));
    write(r, 'scripts/backfill-thing-b.mjs', backfillSource('pre-deploy'));
    commit(r, 'feat: b');
    const { code, out } = run(r, 'check-schema-change.mjs');
    assert.equal(code, 0, out);
    assert.match(out, /backfill-thing-b/);
  });

  it('a pre-deploy backfill under scripts/backfill/ counts too — the registry scans it', () => {
    const r = baseRepo();
    write(r, MODEL, schema(['a: z.string()', 'b: z.number()']));
    write(r, 'scripts/backfill/thing-b.mjs', backfillSource('pre-deploy'));
    commit(r, 'feat: b');
    const { code, out } = run(r, 'check-schema-change.mjs');
    assert.equal(code, 0, out);
    assert.match(out, /scripts\/backfill\/thing-b\.mjs/);
  });

  it('a pre-deploy backfill deeper than the registry scans does not count', () => {
    const r = baseRepo();
    write(r, MODEL, schema(['a: z.string()', 'b: z.number()']));
    write(r, 'scripts/lib/thing-b.mjs', backfillSource('pre-deploy'));
    commit(r, 'feat: b');
    assert.equal(run(r, 'check-schema-change.mjs').code, 1);
  });

  it('a post-deploy backfill does not satisfy a tightening', () => {
    const r = baseRepo();
    write(r, MODEL, schema(['a: z.string()', 'b: z.number()']));
    write(r, 'scripts/backfill-thing-b.mjs', backfillSource('post-deploy'));
    commit(r, 'feat: b');
    assert.equal(run(r, 'check-schema-change.mjs').code, 1);
  });

  it('a new model file is a new collection with no old data', () => {
    const r = baseRepo();
    write(r, 'packages/shared/src/models/thing/OtherDataModel.ts', schema(['x: z.string()']));
    commit(r, 'feat: new collection');
    assert.equal(run(r, 'check-schema-change.mjs').code, 0);
  });

  it('a required field removed fails even with a backfill — no backfill fixes an installed binary', () => {
    const r = repo();
    write(r, MODEL, schema(['a: z.string()', 'b: z.number()']));
    commit(r, 'base');
    git(r, 'branch', 'base-ref');
    write(r, MODEL, schema(['a: z.string()']));
    write(r, 'scripts/backfill-thing-b.mjs', backfillSource('pre-deploy'));
    commit(r, 'refactor: drop b');
    const { code, out } = run(r, 'check-schema-change.mjs');
    assert.equal(code, 1, out);
    assert.match(out, /b: required field removed/);
  });

  it('a trailer declares a loosening', () => {
    const r = repo();
    write(r, MODEL, schema(['a: z.string()', 'b: z.number()']));
    commit(r, 'base');
    git(r, 'branch', 'base-ref');
    write(r, MODEL, schema(['a: z.string()']));
    commit(r, 'refactor: drop b\n\nBreaking-Client: builds before 1.4 require b');
    assert.equal(run(r, 'check-schema-change.mjs').code, 0);
  });

  it('form schemas are out of scope', () => {
    const r = repo();
    write(r, 'packages/shared/src/models/thing/ThingFormSchema.ts', schema(['a: z.string()']));
    commit(r, 'base');
    git(r, 'branch', 'base-ref');
    write(r, 'packages/shared/src/models/thing/ThingFormSchema.ts', schema(['a: z.string()', 'b: z.number()']));
    commit(r, 'feat: form');
    assert.equal(run(r, 'check-schema-change.mjs').code, 0);
  });
});
