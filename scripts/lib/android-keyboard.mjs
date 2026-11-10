/**
 * Turn off Gboard's auto-correction and auto-capitalization on the device under
 * test, keeping the on-screen keyboard itself.
 *
 * WHY: a flow types an exact string and then asserts that exact string in
 * Firestore. Gboard rewrites what Maestro types — "virgen" became "virgin",
 * "nativo" became "Nativo", "sierra" became "Sierra" — so the app stored a
 * different value than the flow typed, and six flows failed against a backend
 * that was working. Recent system images (Android 15+, Pixel profiles) ship
 * Gboard; the older google_apis image CI ran on did not, which is why CI stayed
 * green while a local AVD went red.
 *
 * The keyboard stays ON SCREEN on purpose: the soft keyboard covering a field
 * or a send button is a real-user bug the suite should keep catching. Only the
 * rewriting goes.
 *
 * There is no adb setting for either switch, so this drives Gboard's own
 * settings screen through `uiautomator dump`, the same way a person would.
 * A device without Gboard is left alone.
 */
import { spawnSync } from 'node:child_process';

const GBOARD = 'com.google.android.inputmethod.latin';
const SETTINGS = `${GBOARD}/com.google.android.apps.inputmethod.latin.preference.SettingsActivity`;
const SWITCHES = ['Auto-correction', 'Auto-capitalization'];
const PAGES = ['Text correction', 'Physical keyboard'];

function adb(adbBin, device, args) {
  return spawnSync(adbBin, ['-s', device, ...args], { encoding: 'utf8' });
}

function dump(adbBin, device) {
  adb(adbBin, device, ['shell', 'uiautomator', 'dump', '/sdcard/e2e-ui.xml']);
  return adb(adbBin, device, ['shell', 'cat', '/sdcard/e2e-ui.xml']).stdout ?? '';
}

function bounds(node) {
  const m = /bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/.exec(node);
  return m ? { x1: +m[1], y1: +m[2], x2: +m[3], y2: +m[4] } : null;
}

function nodes(xml) {
  return xml.split('<node').slice(1);
}

function find(xml, text) {
  const node = nodes(xml).find((n) => n.includes(`text="${text}"`));
  return node ? bounds(node) : null;
}

/** The switch on the same row as a title: the Switch whose height overlaps the title's. */
function switchBeside(xml, title) {
  for (const n of nodes(xml)) {
    if (!n.includes('class="android.widget.Switch"')) continue;
    const b = bounds(n);
    // A greyed-out switch does nothing: on the physical-keyboard page
    // auto-capitalization is inert once auto-correction is off.
    if (b && b.y1 <= title.y2 && title.y1 <= b.y2) {
      return { ...b, checked: n.includes('checked="true"') && !n.includes('enabled="false"') };
    }
  }
  return null;
}

function tap(adbBin, device, b) {
  adb(adbBin, device, ['shell', 'input', 'tap', String((b.x1 + b.x2) >> 1), String((b.y1 + b.y2) >> 1)]);
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** The screen's height, from the root node. */
function screenHeight(xml) {
  return bounds(nodes(xml)[0] ?? '')?.y2 ?? 2000;
}

/**
 * Finds `text` on screen, scrolling down until it sits in the upper part of
 * it: a row at the bottom edge is clipped, and its switch with it.
 */
function scrollTo(adbBin, device, text) {
  let last = null;
  for (let i = 0; i < 8; i++) {
    const xml = dump(adbBin, device);
    const b = find(xml, text);
    if (b) last = { xml, b };
    if (b && b.y2 < screenHeight(xml) * 0.75) return last;
    adb(adbBin, device, ['shell', 'input', 'swipe', '540', '2000', '540', '600', '400']);
    sleep(800);
  }
  // A short page cannot scroll its last row up; take it where it is.
  return last;
}

export function disableKeyboardRewriting({ adbBin, device, log }) {
  const installed = adb(adbBin, device, ['shell', 'pm', 'list', 'packages', GBOARD]).stdout ?? '';
  if (!installed.includes(`package:${GBOARD}`)) {
    log('no Gboard on this device; keyboard left as it is');
    return true;
  }
  let ok = true;
  // Gboard keeps one pair of switches for the on-screen keyboard and another
  // for a physical one, and Maestro's key events can land on either: an AVD
  // with `hw.keyboard=yes` (CI's profile) reads the physical pair, so turning
  // only the first one off still stored "virgen" as "virgin".
  for (const page of PAGES) {
    adb(adbBin, device, ['shell', 'am', 'force-stop', GBOARD]);
    adb(adbBin, device, ['shell', 'am', 'start', '-n', SETTINGS]);
    sleep(2500);
    const entry = scrollTo(adbBin, device, page);
    if (!entry) {
      log(`Gboard settings did not show "${page}"`);
      ok = false;
      continue;
    }
    tap(adbBin, device, entry.b);
    sleep(1500);
    for (const label of SWITCHES) {
      const found = scrollTo(adbBin, device, label);
      const sw = found && switchBeside(found.xml, found.b);
      if (!sw) {
        log(`Gboard ${page}: "${label}" not found`);
        ok = false;
        continue;
      }
      if (sw.checked) {
        tap(adbBin, device, found.b);
        sleep(800);
        if (switchBeside(dump(adbBin, device), found.b)?.checked) {
          log(`Gboard ${page}: "${label}" would not switch off`);
          ok = false;
          continue;
        }
      }
      log(`Gboard ${page}: ${label} off`);
    }
  }
  adb(adbBin, device, ['shell', 'input', 'keyevent', 'KEYCODE_HOME']);
  // The running keyboard keeps the settings it started with: without a
  // restart it still rewrote "editado" as "Editado" after both switches read off.
  adb(adbBin, device, ['shell', 'am', 'force-stop', GBOARD]);
  return ok;
}
