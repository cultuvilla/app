import fs from "fs";
import path from "path";

import { MAX_FONT_SIZE_MULTIPLIER, TEXT_SCALING } from "../textScaling";

const APP_ROOT = path.resolve(__dirname, "../../..");
const SCANNED = ["app", "components", "lib"];
const IGNORED = /node_modules|__tests__|__mocks__|\.test\.|\.d\.ts$/;
const SCALING_PROP = /TEXT_SCALING|maxFontSizeMultiplier|allowFontScaling/;

const collectSourceFiles = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (IGNORED.test(full)) return [];
    if (entry.isDirectory()) return collectSourceFiles(full);
    return /\.(ts|tsx)$/.test(full) ? [full] : [];
  });

/** JSX examples inside doc comments are prose, not call sites. */
const stripComments = (source: string): string =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " "))
    .replace(/^\s*\/\/.*$/gm, "");

/** Local names a file binds to React Native's own `Text` and `TextInput`. */
const rawTextNames = (source: string): string[] => {
  const names: string[] = [];
  for (const [, specifiers] of source.matchAll(
    /import\s*\{([^}]*)\}\s*from\s*'react-native'/g,
  )) {
    for (const spec of (specifiers ?? "").split(",")) {
      const match = spec.trim().match(/^(Text|TextInput)(?:\s+as\s+(\w+))?$/);
      if (match) names.push(match[2] ?? match[1]!);
    }
  }
  return names;
};

/**
 * Everything between `<Name` and the `>` that closes the opening tag. The
 * lookbehind skips type arguments such as `useRef<TextInput>(null)`.
 */
const openingTags = (
  source: string,
  name: string,
): { tag: string; line: number }[] => {
  const tags: { tag: string; line: number }[] = [];
  const element = new RegExp(`(?<![A-Za-z0-9_$.])<${name}(?=[\\s/>])`, "g");
  let match: RegExpExecArray | null;
  while ((match = element.exec(source))) {
    let depth = 0;
    let tag = "";
    for (let i = match.index + match[0].length; i < source.length; i++) {
      const char = source[i];
      if (char === "{") depth++;
      else if (char === "}") depth--;
      else if (char === ">" && depth === 0) break;
      tag += char;
    }
    tags.push({ tag, line: source.slice(0, match.index).split("\n").length });
  }
  return tags;
};

describe("textScaling", () => {
  it("never lets text grow past 1.5×", () => {
    expect(MAX_FONT_SIZE_MULTIPLIER).toBe(1.5);
    for (const preset of Object.values(TEXT_SCALING)) {
      expect(preset.maxFontSizeMultiplier).toBeGreaterThanOrEqual(1);
      expect(preset.maxFontSizeMultiplier).toBeLessThanOrEqual(
        MAX_FONT_SIZE_MULTIPLIER,
      );
    }
  });

  // The Text primitive applies its preset itself; a raw React Native Text or
  // TextInput has no default (React 19 ignores defaultProps on function
  // components), so each one must spread a preset at its call site.
  it("every raw React Native <Text> and <TextInput> declares a scaling preset", () => {
    const offenders = SCANNED.flatMap((dir) =>
      collectSourceFiles(path.join(APP_ROOT, dir)),
    ).flatMap((file) => {
      const source = stripComments(fs.readFileSync(file, "utf8"));
      return rawTextNames(source).flatMap((name) =>
        openingTags(source, name)
          .filter(({ tag }) => !SCALING_PROP.test(tag))
          .map(({ line }) => `${path.relative(APP_ROOT, file)}:${line}`),
      );
    });
    expect(offenders).toEqual([]);
  });
});
