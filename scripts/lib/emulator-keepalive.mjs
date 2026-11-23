/**
 * The Firestore emulator's gRPC keepalive policy, made to match production.
 *
 * The emulator jar builds its gRPC server with grpc-java's defaults, which
 * allow a client one ping per 5 minutes and only while a call is open. The
 * Firestore SDKs ping every 30 s (production accepts that), so the emulator
 * dropped the iOS SDK's connections with GOAWAY too_many_pings, and the
 * Simulator then stalled a write for ~90 s. The jar offers no flag for it, so
 * scripts/emulator-keepalive/ holds a copy of grpc-java's KeepAliveEnforcer with
 * the limits read from system properties, compiled here and put ahead of the
 * jar's own class with -Xbootclasspath/a. Why, and the evidence:
 * docs/decisions/ios-e2e-emulator-keepalive.md.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SOURCE = path.join(ROOT, 'scripts', 'emulator-keepalive', 'io', 'grpc', 'internal', 'KeepAliveEnforcer.java');
const OUT_DIR = path.join(ROOT, 'node_modules', '.cache', 'emulator-keepalive');
const CLASS = path.join(OUT_DIR, 'io', 'grpc', 'internal', 'KeepAliveEnforcer.class');

/** A third of the SDKs' 30 s keepalive: their pings always clear it. */
export const KEEPALIVE_PERMIT_MS = 10_000;

/** What KeepAliveEnforcer.java prints once the emulator loads it with these options. */
export const KEEPALIVE_POLICY_LINE = `[emulator-keepalive] client pings permitted every ${KEEPALIVE_PERMIT_MS} ms, without calls: true`;

const CLASS_NAME = 'io.grpc.internal.KeepAliveEnforcer';

/** The Firestore emulator jar firebase-tools runs, resolved the way firebase-tools does. */
export function firestoreEmulatorJar() {
  if (process.env.FIRESTORE_EMULATOR_BINARY_PATH) return process.env.FIRESTORE_EMULATOR_BINARY_PATH;
  const require = createRequire(path.join(ROOT, 'package.json'));
  const info = JSON.parse(
    readFileSync(require.resolve('firebase-tools/lib/emulator/downloadableEmulatorInfo.json'), 'utf8'),
  );
  const cache = process.env.FIREBASE_EMULATORS_PATH || path.join(os.homedir(), '.cache', 'firebase', 'emulators');
  return path.join(cache, info.firestore.downloadPathRelativeToCacheDir);
}

function javapSignature(classpath) {
  const res = spawnSync('javap', ['-cp', classpath, CLASS_NAME], { encoding: 'utf8' });
  if (res.status !== 0) throw new Error(`javap could not read ${CLASS_NAME} from ${classpath}: ${res.stderr}`);
  // Drop "Compiled from …": the file name is not the API.
  return res.stdout.split('\n').filter((line) => !line.startsWith('Compiled from')).join('\n').trim();
}

/**
 * Null when our copy has the same constructors, methods and fields as the
 * jar's own class (what NettyServerHandler links against), else why not. A
 * firebase-tools bump that changes the class must stop the run, never let a
 * stale copy pass: re-derive the copy from the new class, then re-check.
 */
export function keepaliveApiMismatch(jar = firestoreEmulatorJar()) {
  const theirs = javapSignature(jar);
  const ours = javapSignature(OUT_DIR);
  return theirs === ours
    ? null
    : `${CLASS_NAME} in ${path.basename(jar)} no longer matches scripts/emulator-keepalive/:\n--- jar\n${theirs}\n--- ours\n${ours}`;
}

function mtime(file) {
  try {
    return statSync(file).mtimeMs;
  } catch {
    return 0;
  }
}

/**
 * JVM options that give the emulator the production-like keepalive policy.
 * Compiles the class when it is missing or older than its source; throws when
 * javac cannot, so a run never goes ahead silently on the stock policy.
 */
export function emulatorKeepaliveJavaOptions() {
  if (mtime(CLASS) < mtime(SOURCE)) {
    mkdirSync(OUT_DIR, { recursive: true });
    // Release 11, the level of the jar's own classes: any JVM that runs the
    // emulator (CI's Temurin 21, a developer's) loads it.
    const res = spawnSync('javac', ['--release', '11', '-d', OUT_DIR, SOURCE], { encoding: 'utf8' });
    if (res.status !== 0) {
      throw new Error(`javac failed to build the emulator keepalive policy: ${res.error?.message ?? res.stderr}`);
    }
  }
  return [
    `-Xbootclasspath/a:${OUT_DIR}`,
    `-Dcultuvilla.emulator.permitKeepAliveTimeMs=${KEEPALIVE_PERMIT_MS}`,
    '-Dcultuvilla.emulator.permitKeepAliveWithoutCalls=true',
  ].join(' ');
}
