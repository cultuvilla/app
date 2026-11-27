'use strict';
// A YAML reader for the subset GitHub workflows and Maestro flows are written in,
// so the checks that read them need no dependency (this repo has no package.json).
//
// Supported: block mappings and sequences (compact `- key: v` items included),
// literal and folded block scalars with chomping, flow `{}` / `[]` collections
// across lines, single- and double-quoted scalars, multi-line plain scalars,
// comments, and `---` documents. Plain scalars resolve as YAML 1.2's core schema
// (null, booleans, numbers; `on` stays a string).
//
// Not supported, and thrown on rather than guessed: anchors, aliases, tags,
// merge keys, explicit `?` keys and tabs used as indentation. A check that
// cannot read a file must fail loudly — skipping it would pass the very file
// that holds the problem.

class YamlSubsetError extends Error {}

function fail(message, line) {
  throw new YamlSubsetError(line ? `${message} (line ${line.no})` : message);
}

/** Column of a comment's `#`, or -1. Quotes count only where a scalar can start. */
function commentStart(text) {
  let quote = null;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const prev = i === 0 ? ' ' : text[i - 1];
    if (quote) {
      if (quote === "'" && c === "'" && text[i + 1] === "'") i++;
      else if (quote === '"' && c === '\\') i++;
      else if (c === quote) quote = null;
    } else if ((c === '"' || c === "'") && /[\s[{,:-]/.test(prev)) {
      quote = c;
    } else if (c === '#' && /\s/.test(prev)) {
      return i;
    }
  }
  return -1;
}

function stripComment(text) {
  const at = commentStart(text);
  return (at === -1 ? text : text.slice(0, at)).replace(/\s+$/, '');
}

function splitDocuments(source) {
  const docs = [[]];
  source.replace(/\r\n?/g, '\n').split('\n').forEach((raw, i) => {
    if (/^---(\s|$)/.test(raw)) {
      docs.push([]);
      const rest = raw.slice(3).trim();
      if (rest && !rest.startsWith('#')) docs[docs.length - 1].push({ no: i + 1, raw: ' '.repeat(4) + rest });
      return;
    }
    if (/^\.\.\.(\s|$)/.test(raw) || /^%/.test(raw)) return;
    docs[docs.length - 1].push({ no: i + 1, raw });
  });
  return docs.filter((lines, i) => i === 0 ? lines.some(contentful) : true);
}

const indentOf = (raw) => raw.length - raw.trimStart().length;
function contentful(line) {
  return stripComment(line.raw).trim() !== '';
}

function resolvePlain(s) {
  if (s === '' || s === '~' || /^(null|Null|NULL)$/.test(s)) return null;
  if (/^(true|True|TRUE)$/.test(s)) return true;
  if (/^(false|False|FALSE)$/.test(s)) return false;
  if (/^[-+]?[0-9]+$/.test(s)) return Number.parseInt(s, 10);
  if (/^0x[0-9a-fA-F]+$/.test(s)) return Number.parseInt(s.slice(2), 16);
  if (/^0o[0-7]+$/.test(s)) return Number.parseInt(s.slice(2), 8);
  if (/^[-+]?(\.[0-9]+|[0-9]+(\.[0-9]*)?)([eE][-+]?[0-9]+)?$/.test(s)) return Number.parseFloat(s);
  if (/^[-+]?\.(inf|Inf|INF)$/.test(s)) return s.startsWith('-') ? -Infinity : Infinity;
  if (/^\.(nan|NaN|NAN)$/.test(s)) return Number.NaN;
  return s;
}

const ESCAPES = { n: '\n', t: '\t', r: '\r', '0': '\0', '"': '"', '\\': '\\', '/': '/', ' ': ' ', e: '\x1b', a: '\x07', b: '\b' };

/** Read a quoted scalar starting at text[i]; returns [value, nextIndex] or null when unterminated. */
function readQuoted(text, i) {
  const q = text[i];
  let out = '';
  for (let j = i + 1; j < text.length; j++) {
    const c = text[j];
    if (q === "'" && c === "'") {
      if (text[j + 1] === "'") { out += "'"; j++; continue; }
      return [out, j + 1];
    }
    if (q === '"' && c === '"') return [out, j + 1];
    if (c === '\n') {
      // A raw line break folds: one becomes a space, n+1 become n newlines.
      out = out.replace(/[ \t]+$/, '');
      let breaks = 0;
      while (text[j] === '\n') {
        breaks++;
        j++;
        while (text[j] === ' ' || text[j] === '\t') j++;
      }
      out += breaks === 1 ? ' ' : '\n'.repeat(breaks - 1);
      j--;
      continue;
    }
    if (q === '"' && c === '\\') {
      if (j + 1 >= text.length) return null;
      const e = text[j + 1];
      if (e === 'x' || e === 'u' || e === 'U') {
        const n = { x: 2, u: 4, U: 8 }[e];
        out += String.fromCodePoint(Number.parseInt(text.slice(j + 2, j + 2 + n), 16));
        j += 1 + n;
      } else if (e === '\n') {
        fail('an escaped line break in a double-quoted scalar is not supported');
      } else if (e in ESCAPES) {
        out += ESCAPES[e];
        j += 1;
      } else fail(`unknown escape \\${e}`);
      continue;
    }
    out += c;
  }
  return null;
}

/** Fold the line breaks of a multi-line flow or quoted scalar the way YAML does. */
function foldBreaks(text) {
  return text.replace(/[ \t]*\n[ \t]*/g, '\n').replace(/\n+/g, (m) => (m.length === 1 ? ' ' : '\n'.repeat(m.length - 1)));
}

function parseFlow(text, line) {
  let i = 0;
  const ws = () => { while (i < text.length && /\s/.test(text[i])) i++; };
  function scalar(terminators) {
    ws();
    if (text[i] === '"' || text[i] === "'") {
      const r = readQuoted(text, i);
      if (!r) fail('unterminated quoted scalar', line);
      i = r[1];
      return r[0];
    }
    let start = i;
    while (i < text.length && !terminators(i)) i++;
    return resolvePlain(foldBreaks(text.slice(start, i)).trim());
  }
  function value(inMap) {
    ws();
    if (text[i] === '{') return map();
    if (text[i] === '[') return seq();
    if (text[i] === '&' || text[i] === '*' || text[i] === '!') fail('anchors, aliases and tags are not supported', line);
    return scalar((k) => text[k] === ',' || text[k] === (inMap ? '}' : ']') || (!inMap && text[k] === ':' && /[\s,\]]/.test(text[k + 1] ?? ' ')));
  }
  function map() {
    const out = {};
    i++;
    for (;;) {
      ws();
      if (text[i] === '}') { i++; return out; }
      const key = scalar((k) => (text[k] === ':' && /[\s,}]/.test(text[k + 1] ?? ' ')) || text[k] === ',' || text[k] === '}');
      ws();
      let v = null;
      if (text[i] === ':') { i++; v = value(true); }
      out[String(key)] = v;
      ws();
      if (text[i] === ',') { i++; continue; }
      if (text[i] === '}') { i++; return out; }
      fail('malformed flow mapping', line);
    }
  }
  function seq() {
    const out = [];
    i++;
    for (;;) {
      ws();
      if (text[i] === ']') { i++; return out; }
      out.push(value(false));
      ws();
      if (text[i] === ',') { i++; continue; }
      if (text[i] === ']') { i++; return out; }
      fail('malformed flow sequence', line);
    }
  }
  const v = value(false);
  ws();
  if (i < text.length) fail(`unexpected text after a flow collection: ${text.slice(i)}`, line);
  return v;
}

function flowBalanced(text) {
  let depth = 0;
  let quote = null;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (quote === '"' && c === '\\') i++;
      else if (c === quote) quote = null;
    } else if (c === '"' || c === "'") quote = c;
    else if (c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') depth--;
  }
  return depth <= 0 && !quote;
}

/** Column of a mapping's `:` in a line, or -1 when the line is not a mapping entry. */
function keyColon(text) {
  let i = 0;
  if (text[0] === '"' || text[0] === "'") {
    const r = readQuoted(text, 0);
    if (!r) return -1;
    i = r[1];
    while (text[i] === ' ') i++;
    return text[i] === ':' && /\s|^$/.test(text[i + 1] ?? '') ? i : -1;
  }
  if (/^[[{|>&*!%@`]/.test(text) || text.startsWith('- ') || text === '-') return -1;
  for (; i < text.length; i++) {
    if (text[i] === ':' && (i + 1 === text.length || /\s/.test(text[i + 1]))) return i;
    if (text[i] === '#' && /\s/.test(text[i - 1] ?? ' ')) return -1;
  }
  return -1;
}

function parseKey(raw, line) {
  const k = raw.trim();
  if (k.startsWith('"') || k.startsWith("'")) return readQuoted(k, 0)[0];
  if (k === '<<') fail('merge keys are not supported', line);
  if (k.startsWith('?')) fail('explicit keys are not supported', line);
  return String(resolvePlain(k));
}

function parseDocument(lines) {
  let pos = 0;
  for (const line of lines) {
    if (/^\t/.test(line.raw) || /^ *\t/.test(line.raw.replace(/\S.*$/, '')) && contentful(line)) fail('tabs used as indentation', line);
  }

  const peek = () => {
    while (pos < lines.length && !contentful(lines[pos])) pos++;
    return lines[pos];
  };
  const textOf = (line) => stripComment(line.raw).trimStart();
  const isSeqItem = (text) => text === '-' || text.startsWith('- ');

  function node(parentIndent) {
    const line = peek();
    if (!line || indentOf(line.raw) <= parentIndent) return null;
    const indent = indentOf(line.raw);
    const text = textOf(line);
    if (isSeqItem(text)) return sequence(indent);
    if (keyColon(text) !== -1) return mapping(indent);
    pos++;
    return inline(text, parentIndent, line);
  }

  function sequence(indent) {
    const out = [];
    for (let line = peek(); line && indentOf(line.raw) === indent && isSeqItem(textOf(line)); line = peek()) {
      const text = textOf(line);
      const rest = text.slice(1).trimStart();
      if (rest === '') {
        pos++;
        out.push(node(indent));
        continue;
      }
      // Re-read the item's content as a line of its own, at the column it starts on,
      // so `- name: x` followed by `  run: y` parses as one mapping.
      const col = indentOf(line.raw) + (text.length - rest.length);
      lines[pos] = { no: line.no, raw: ' '.repeat(col) + line.raw.trimStart().slice(text.length - rest.length) };
      out.push(node(indent));
    }
    return out;
  }

  function mapping(indent) {
    const out = {};
    for (let line = peek(); line && indentOf(line.raw) === indent; line = peek()) {
      const text = textOf(line);
      const at = keyColon(text);
      if (at === -1 || isSeqItem(text)) fail('expected a mapping key', line);
      const key = parseKey(text.slice(0, at), line);
      const rest = text.slice(at + 1).trim();
      pos++;
      if (rest === '') {
        const next = peek();
        // A sequence may sit at its key's own indentation.
        if (next && indentOf(next.raw) === indent && isSeqItem(textOf(next))) out[key] = sequence(indent);
        else out[key] = node(indent);
      } else {
        const rawRest = line.raw.slice(line.raw.indexOf(':', indentOf(line.raw) + (text.length - text.trimStart().length) + at) + 1).trim();
        out[key] = inline(rest, indent, line, rawRest);
      }
    }
    return out;
  }

  /** The value written on a line, plus whatever lines continue it. */
  function inline(text, parentIndent, line, rawText = text) {
    const c = text[0];
    if (c === '&' || c === '*' || c === '!') fail('anchors, aliases and tags are not supported', line);
    if (c === '|' || c === '>') return blockScalar(rawText.replace(/\s+#.*$/, ''), parentIndent, line);
    if (c === '{' || c === '[') {
      let flow = text;
      while (!flowBalanced(flow)) {
        const next = lines[pos++];
        if (!next) fail('unterminated flow collection', line);
        flow += `\n${stripComment(next.raw)}`;
      }
      return parseFlow(flow, line);
    }
    if (c === '"' || c === "'") {
      let quoted = rawText;
      let r = readQuoted(quoted, 0);
      while (!r) {
        const next = lines[pos++];
        if (!next) fail('unterminated quoted scalar', line);
        quoted += `\n${next.raw}`;
        r = readQuoted(quoted, 0);
      }
      const tail = stripComment(quoted.slice(r[1])).trim();
      if (tail) fail(`unexpected text after a quoted scalar: ${tail}`, line);
      return r[0];
    }
    if (/^[?:](\s|$)/.test(text)) fail('explicit keys are not supported', line);
    const parts = [text.trim()];
    for (let next = peek(); next && indentOf(next.raw) > parentIndent; next = peek()) {
      const more = textOf(next);
      // A key, item or explicit-key marker cannot continue a plain scalar; YAML
      // rejects it, so reading it as more text would be a silent misread.
      if (keyColon(more) !== -1 || isSeqItem(more) || /^[?:](\s|$)/.test(more)) fail('unexpected content (check its indentation)', next);
      parts.push(more.trim());
      pos++;
    }
    return resolvePlain(parts.join(' '));
  }

  function blockScalar(header, parentIndent, line) {
    const m = /^([|>])([+-]?)([1-9]?)([+-]?)$/.exec(header.trim());
    if (!m) fail(`malformed block scalar header ${header}`, line);
    const folded = m[1] === '>';
    const chomp = m[2] || m[4];
    let contentIndent = m[3] ? parentIndent + Number(m[3]) : -1;
    const body = [];
    while (pos < lines.length) {
      const raw = lines[pos].raw;
      if (raw.trim() === '') { body.push(''); pos++; continue; }
      const ind = indentOf(raw);
      if (contentIndent === -1) {
        if (ind <= parentIndent) break;
        contentIndent = ind;
      }
      if (ind < contentIndent) break;
      body.push(raw.slice(contentIndent));
      pos++;
    }
    let trailing = 0;
    while (body.length && body[body.length - 1] === '') { body.pop(); trailing++; }
    let text;
    if (!folded) text = body.join('\n');
    else {
      text = '';
      body.forEach((l, i) => {
        if (i === 0) { text = l; return; }
        const prev = body[i - 1];
        const moreIndented = (s) => /^\s/.test(s);
        if (l === '') text += '\n';
        else if (prev === '' || moreIndented(l) || moreIndented(prev)) text += (prev === '' && !moreIndented(l) && !moreIndented(body[i - 2] ?? '') ? '' : '\n') + l;
        else text += ` ${l}`;
      });
    }
    if (body.length === 0) return chomp === '+' ? '\n'.repeat(trailing) : '';
    if (chomp === '-') return text;
    if (chomp === '+') return `${text}\n${'\n'.repeat(trailing)}`;
    return `${text}\n`;
  }

  const value = node(-1);
  const left = peek();
  if (left) fail('unexpected content (check its indentation)', left);
  return value === undefined ? null : value;
}

/** Every document in `source`, as js-yaml's loadAll would return them for this subset. */
function loadAll(source) {
  return splitDocuments(source).map(parseDocument);
}

/** The single document in `source`. */
function load(source) {
  const docs = loadAll(source);
  if (docs.length > 1) throw new YamlSubsetError('expected one document, found several');
  return docs.length ? docs[0] : null;
}

module.exports = { load, loadAll, YamlSubsetError };
