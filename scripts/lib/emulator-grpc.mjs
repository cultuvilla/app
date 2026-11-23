/**
 * A launcher for the Firestore emulator jar whose gRPC server lets a write
 * through when a listener it notifies has gone, as production does.
 *
 * The emulator keeps a Listen stream after its client cancels it (the stream's
 * onError ignores CANCELLED and never unregisters it). A later write to a
 * document that stream watched notifies it, grpc-java's ServerCalls throws
 * "call already cancelled", and the write answers HTTP 499 having done some,
 * all or none of its work. Dead streams pile up over an e2e run, so late in a
 * shard every write fails, the retry restore among them (ios-e2e 44914149484).
 *
 * scripts/emulator-grpc/ holds grpc-java's ServerCalls with onNext returning
 * instead of throwing on a cancelled streaming call. It cannot go on the boot
 * class path like scripts/emulator-keepalive/: ServerCalls links against
 * io.grpc and Guava classes that only the jar's own class loader sees. So this
 * compiles it against the jar into a small jar of its own whose manifest names
 * the emulator's Main-Class and puts the stock jar on its Class-Path. The class
 * loader searches the small jar first, so our ServerCalls wins and every other
 * class comes from the stock jar, untouched. firebase-tools runs it through its
 * FIRESTORE_EMULATOR_BINARY_PATH override. (The stock jar is a native launcher
 * with the zip appended, which `jar uf` cannot update in place.)
 * Why, and when to delete it: docs/decisions/ios-e2e-emulator-keepalive.md.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { firestoreEmulatorJar } from './emulator-keepalive.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const GRPC_SOURCE = path.join(ROOT, 'scripts', 'emulator-grpc', 'io', 'grpc', 'stub', 'ServerCalls.java');
const CACHE_DIR = path.join(ROOT, 'node_modules', '.cache', 'emulator-grpc');

function run(cmd, args) {
  const res = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (res.status !== 0) throw new Error(`${cmd} ${args[0]} failed: ${res.error?.message ?? res.stderr}`);
  return res.stdout;
}

/** The ServerCalls classes (outer and nested) found in a jar listing or a directory walk, sorted. */
export function serverCallsClasses(entries) {
  return entries
    .filter((e) => /^io\/grpc\/stub\/ServerCalls(\$[\w$]+)?\.class$/.test(e))
    .map((e) => e.slice(0, -'.class'.length).replaceAll('/', '.'))
    .sort();
}

/**
 * javap's view of a class without what javac and the jar's build may differ on
 * and nothing links against: the source file line and the synthetic this$0
 * field javac 11 gives an inner class.
 */
export function comparableSignature(javapOutput) {
  return javapOutput
    .split('\n')
    .filter((line) => !line.startsWith('Compiled from') && !/\bthis\$\d+;$/.test(line.trim()))
    .join('\n')
    .trim();
}

/**
 * Null when our build replaces exactly the jar's ServerCalls classes, each with
 * the same fields and methods, else why not. A firebase-tools bump that changes
 * them must stop the run, never let a stale copy pass: re-derive the copy from
 * the grpc-java version the new jar carries, then re-check.
 */
export function grpcApiMismatch({ theirs, ours, signature }) {
  if (theirs.join() !== ours.join()) {
    return `the jar's ServerCalls classes (${theirs.join(', ')}) are not the ones scripts/emulator-grpc/ builds (${ours.join(', ')})`;
  }
  for (const cls of theirs) {
    const a = comparableSignature(signature('jar', cls));
    const b = comparableSignature(signature('ours', cls));
    if (a !== b)
      return `${cls} in the emulator jar no longer matches scripts/emulator-grpc/:\n--- jar\n${a}\n--- ours\n${b}`;
  }
  return null;
}

/** The stock jar's Main-Class, which the launcher must name too. */
export function mainClass(manifest) {
  const line = manifest.split(/\r?\n/).find((l) => l.startsWith('Main-Class:'));
  if (!line) throw new Error('the Firestore emulator jar names no Main-Class');
  return line.slice('Main-Class:'.length).trim();
}

/** A Class-Path entry for `target`, relative to the launcher's directory, as a URL. */
export function classPathUrl(fromDir, target) {
  return path.relative(fromDir, target).split(path.sep).map(encodeURIComponent).join('/');
}

/**
 * The path of the launcher jar, built on first use and cached by our source and
 * the stock jar's path. Throws when it cannot be built or does not match the
 * jar, so a run never goes ahead silently on the stock emulator.
 */
export function cancelledListenJar(stockJar = firestoreEmulatorJar()) {
  if (!existsSync(stockJar)) throw new Error(`no Firestore emulator jar at ${stockJar}`);
  const hash = createHash('sha256').update(readFileSync(GRPC_SOURCE)).update(stockJar).digest('hex').slice(0, 12);
  const name = `${path.basename(stockJar, '.jar')}-cancelled-listen-${hash}`;
  const classes = path.join(CACHE_DIR, name);
  const jar = path.join(CACHE_DIR, `${name}.jar`);
  if (existsSync(jar)) return jar;

  rmSync(classes, { recursive: true, force: true });
  mkdirSync(classes, { recursive: true });
  // Release 11, the level of the jar's own classes.
  run('javac', ['-nowarn', '-proc:none', '--release', '11', '-cp', stockJar, '-d', classes, GRPC_SOURCE]);

  const theirs = serverCallsClasses(run('jar', ['tf', stockJar]).split('\n'));
  const ours = serverCallsClasses(
    readdirSync(path.join(classes, 'io', 'grpc', 'stub')).map((f) => `io/grpc/stub/${f}`),
  );
  const mismatch = grpcApiMismatch({
    theirs,
    ours,
    // Without -p: private members (our helper, javac's lambdas) link to nothing outside.
    signature: (side, cls) => run('javap', ['-cp', side === 'jar' ? stockJar : classes, cls]),
  });
  if (mismatch) throw new Error(mismatch);

  const manifest = path.join(CACHE_DIR, `${name}.mf`);
  writeFileSync(
    manifest,
    `Main-Class: ${mainClass(run('unzip', ['-p', stockJar, 'META-INF/MANIFEST.MF']))}\n` +
      // Real paths: the JVM resolves the relative entry after following symlinks (a linked node_modules).
      `Class-Path: ${classPathUrl(realpathSync(CACHE_DIR), realpathSync(stockJar))}\n`,
  );
  const tmp = `${jar}.tmp`;
  rmSync(tmp, { force: true });
  run('jar', ['cfm', tmp, manifest, '-C', classes, 'io/grpc/stub']);
  renameSync(tmp, jar);
  return jar;
}

/**
 * The writes firestore-debug.log shows failing on a cancelled listener, by the
 * emulator operation that failed: `commit` and `write` are the app's own saves,
 * `batchWrite` and `clearData` the retry restore. Each failure logs a WARNING
 * with the cause, then a stack naming the CloudFirestoreV1Router operation.
 */
export function cancelledWriteFailures(log) {
  const byOperation = {};
  let pending = false;
  for (const line of log.split('\n')) {
    if (line.startsWith('WARNING: Operation failed:') && line.includes('call already cancelled')) {
      pending = true;
      continue;
    }
    const op = pending && /CloudFirestoreV1Router\.(\w+)\(/.exec(line);
    if (op) {
      byOperation[op[1]] = (byOperation[op[1]] ?? 0) + 1;
      pending = false;
    }
  }
  const total = Object.values(byOperation).reduce((a, b) => a + b, 0);
  return { total, byOperation };
}
