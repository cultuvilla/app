import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

// A photo upload that fails must say so. Eleven screens awaited the upload in a
// `try { … } finally { setAdding(false) }`: on a failure the spinner stopped,
// the photo was gone, and the rejection went unhandled — which a release build
// shows nobody. Every awaited image upload sits in a `try` with a `catch`
// (useCallableErrorHandler is the one that both tells the person and reports),
// or runs inside a useCallable action, which does the same.

const MOBILE = join(__dirname, '..');
const ROOTS = ['components', 'app'].map((dir) => join(MOBILE, dir));

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : tsxFiles(path);
    return name.endsWith('.tsx') ? [path] : [];
  });
}

const UPLOAD_CALL = /await\s+upload\w*(?:Image|Photo)\(/g;

/** Upload calls with no `catch` between them and the end of their `try`. */
function uncaughtUploads(source: string): number[] {
  const lines: number[] = [];
  for (const match of source.matchAll(UPLOAD_CALL)) {
    const at = match.index ?? 0;
    const tryAt = source.lastIndexOf('try {', at);
    const rest = source.slice(at);
    const catchAt = rest.search(/\bcatch\b/);
    const finallyAt = rest.search(/\bfinally\b/);
    // A save action run through useCallable shows and reports its own errors.
    const inCallable = source.lastIndexOf('useCallable(', at) > tryAt;
    const caught = inCallable || (tryAt !== -1 && catchAt !== -1 && (finallyAt === -1 || catchAt < finallyAt));
    if (!caught) lines.push(source.slice(0, at).split('\n').length);
  }
  return lines;
}

describe('image uploads report their failures', () => {
  it('catches every awaited image upload', () => {
    const offenders = ROOTS.flatMap(tsxFiles).flatMap((file) =>
      uncaughtUploads(readFileSync(file, 'utf8')).map((line) => `${relative(MOBILE, file)}:${String(line)}`),
    );
    expect(offenders).toEqual([]);
  });

  it('flags a try/finally with no catch, and passes one with a catch', () => {
    expect(uncaughtUploads('try { const u = await uploadPlaceImage(a); } finally { done(); }')).toEqual([1]);
    expect(uncaughtUploads('try { const u = await uploadPlaceImage(a); } catch (e) { show(e); } finally { done(); }')).toEqual([]);
    expect(uncaughtUploads('const u = await uploadUserPhoto(a);')).toEqual([1]);
    expect(uncaughtUploads('useCallable({ action: async () => { await uploadEventImage(a); } })')).toEqual([]);
  });
});
