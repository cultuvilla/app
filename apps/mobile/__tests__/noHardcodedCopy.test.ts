import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import ts from 'typescript';

// AGENTS.md § i18n: user-facing strings go through useT(). This fails on copy
// typed straight into what the app renders: JSX text, a literal in a JSX child
// or in one of COPY_ATTRIBUTES, and the title/message of Alert.alert(). It
// descends through `? :`, `??`, `||` and parentheses but never into a call, so
// t('a.b') keys and `type === 'peña'` comparisons stay quiet.
//
// Known gap: copy that reaches the screen through a variable is not seen — a
// `const label = 'Hola'`, a module-level array, a default prop value
// (`placeholder = 'Sin pueblo'`), an object handed to Alert (button `text`).
// Review those by eye.

const MOBILE = join(__dirname, '..');
const ROOTS = ['app', 'components', 'lib'].map((dir) => join(MOBILE, dir));

const COPY_ATTRIBUTES = new Set([
  'accessibilityLabel',
  'accessibilityHint',
  'placeholder',
  'title',
  'label',
  'subtitle',
  'message',
]);

// `file:literal` — not copy to translate.
const ALLOWLIST = new Set([
  // The brand name.
  'components/auth/AuthHeader.tsx:Cultuvilla',
  // An enum prop that happens to be named `title`.
  'components/feature/MembersList.tsx:team',
  // Dev-only login shortcuts (AGENTS.md exempts dev-only surfaces).
  'components/auth/DevLoginButtons.tsx:Dev · entrar como',
]);

const HAS_LETTER = /\p{L}/u;

export interface CopyHit {
  line: number;
  text: string;
}

function literalTexts(node: ts.Expression): string[] {
  if (ts.isParenthesizedExpression(node)) return literalTexts(node.expression);
  if (ts.isConditionalExpression(node)) return [...literalTexts(node.whenTrue), ...literalTexts(node.whenFalse)];
  if (
    ts.isBinaryExpression(node) &&
    (node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken ||
      node.operatorToken.kind === ts.SyntaxKind.BarBarToken)
  ) {
    return literalTexts(node.right);
  }
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return [node.text];
  if (ts.isTemplateExpression(node)) {
    return [[node.head.text, ...node.templateSpans.map((s) => s.literal.text)].join('…')];
  }
  return [];
}

/** Every hard-coded piece of visible copy in one source file. */
export function findHardcodedCopy(source: string, fileName = 'file.tsx'): CopyHit[] {
  const sf = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const hits: CopyHit[] = [];
  const report = (node: ts.Node, text: string) => {
    const trimmed = text.replace(/\s+/g, ' ').trim();
    if (!HAS_LETTER.test(trimmed)) return;
    hits.push({ line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1, text: trimmed });
  };
  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node)) {
      report(node, node.text);
    } else if (ts.isJsxExpression(node) && node.expression && ts.isJsxElement(node.parent)) {
      for (const text of literalTexts(node.expression)) report(node, text);
    } else if (ts.isJsxExpression(node) && node.expression && ts.isJsxFragment(node.parent)) {
      for (const text of literalTexts(node.expression)) report(node, text);
    } else if (ts.isJsxAttribute(node) && node.initializer && COPY_ATTRIBUTES.has(node.name.getText(sf))) {
      const init = node.initializer;
      if (ts.isStringLiteral(init)) report(init, init.text);
      else if (ts.isJsxExpression(init) && init.expression) {
        for (const text of literalTexts(init.expression)) report(init, text);
      }
    } else if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.getText(sf) === 'Alert.alert'
    ) {
      for (const arg of node.arguments.slice(0, 2)) {
        for (const text of literalTexts(arg)) report(arg, text);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return hits;
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.(test|d)\.tsx?$/.test(name) ? [path] : [];
  });
}

describe('findHardcodedCopy', () => {
  it('flags JSX text', () => {
    expect(findHardcodedCopy('const A = () => <Text>Sin resultados</Text>;')).toEqual([
      { line: 1, text: 'Sin resultados' },
    ]);
  });

  it('flags a literal copy attribute, through a conditional', () => {
    const src = `const A = ({ v }) => <Pressable accessibilityLabel={v ? 'Ocultar' : 'Mostrar'} placeholder="Buscar" />;`;
    expect(findHardcodedCopy(src).map((h) => h.text)).toEqual(['Ocultar', 'Mostrar', 'Buscar']);
  });

  it('flags the static part of a template child', () => {
    const src = 'const A = ({ v }) => <Text>{`Versión ${v}`}</Text>;';
    expect(findHardcodedCopy(src).map((h) => h.text)).toEqual(['Versión …']);
  });

  it('flags Alert.alert literals in a .ts file', () => {
    expect(findHardcodedCopy("Alert.alert('Error', m);", 'x.ts').map((h) => h.text)).toEqual(['Error']);
  });

  it('stays quiet on keys, comparisons, punctuation and other props', () => {
    const src = `
      const A = ({ type }) => (
        <View testID="row-1">
          <Text>{t('common.cancel')}</Text>
          <Text accessibilityLabel={t('a.b', { n: 1 })}>·</Text>
          {type === 'peña' ? <Icon name="people" /> : null}
          <Text>{count}</Text>
        </View>
      );`;
    expect(findHardcodedCopy(src)).toEqual([]);
  });
});

describe('no hard-coded visible copy in apps/mobile', () => {
  it('finds source files to scan', () => {
    expect(ROOTS.flatMap(sourceFiles).length).toBeGreaterThan(100);
  });

  it('reads every visible string from the i18n catalog', () => {
    const allowlisted = new Set<string>();
    const offenders = ROOTS.flatMap(sourceFiles).flatMap((file) => {
      const rel = relative(MOBILE, file);
      return findHardcodedCopy(readFileSync(file, 'utf8'), file).flatMap(({ line, text }) => {
        const key = `${rel}:${text}`;
        if (ALLOWLIST.has(key)) {
          allowlisted.add(key);
          return [];
        }
        return [`${rel}:${line} «${text}» → move it to packages/i18n/messages/es.json and read it with t()`];
      });
    });
    expect(offenders).toEqual([]);
    // An allowlist entry that matches nothing is stale: delete it.
    expect([...ALLOWLIST].filter((key) => !allowlisted.has(key))).toEqual([]);
  });
});
