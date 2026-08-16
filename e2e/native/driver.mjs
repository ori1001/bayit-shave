import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Minimal UI driver for the Android emulator.
 *
 * React Native's testID surfaces as resource-id in the uiautomator hierarchy,
 * so the same identifiers the Jest and Playwright suites use select elements
 * here too -- no separate native test framework, and no brittle hardcoded
 * screen coordinates.
 */

const ADB =
  process.env.ADB_PATH ??
  join(process.env.LOCALAPPDATA ?? '', 'Android', 'Sdk', 'platform-tools', 'adb.exe');

const tmp = mkdtempSync(join(tmpdir(), 'nativee2e-'));

function adb(args, opts = {}) {
  return execFileSync(ADB, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, ...opts });
}

export function dump() {
  adb(['shell', 'uiautomator', 'dump', '/sdcard/ui.xml']);
  const local = join(tmp, `ui-${Date.now()}.xml`);
  adb(['pull', '/sdcard/ui.xml', local]);
  return readFileSync(local, 'utf8');
}

function nodesFrom(xml) {
  const nodes = [];
  const re = /<node[^>]*?resource-id="([^"]*)"[^>]*?bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"[^>]*?\/?>/g;
  let m;
  while ((m = re.exec(xml))) {
    const [, id, x1, y1, x2, y2] = m;
    nodes.push({
      id,
      bounds: [Number(x1), Number(y1), Number(x2), Number(y2)],
      center: [Math.round((Number(x1) + Number(x2)) / 2), Math.round((Number(y1) + Number(y2)) / 2)],
    });
  }
  return nodes;
}

export function findAll(testId, xml = dump()) {
  return nodesFrom(xml).filter((n) => n.id === testId);
}

/** Polls the hierarchy until the element appears, or throws with what was on screen. */
export async function waitFor(testId, { timeout = 30_000, interval = 1200 } = {}) {
  const deadline = Date.now() + timeout;
  let lastXml = '';
  while (Date.now() < deadline) {
    lastXml = dump();
    const found = findAll(testId, lastXml);
    if (found.length) return found[0];
    await new Promise((r) => setTimeout(r, interval));
  }
  const visible = [...new Set(nodesFrom(lastXml).map((n) => n.id).filter(Boolean))];
  throw new Error(`Timed out waiting for "${testId}". Visible testIDs: ${visible.join(', ') || '(none)'}`);
}

export async function tap(testId, opts) {
  const el = await waitFor(testId, opts);
  adb(['shell', 'input', 'tap', String(el.center[0]), String(el.center[1])]);
  return el;
}

export async function typeText(testId, text, opts) {
  await tap(testId, opts);
  // `input text` treats spaces specially and chokes on some punctuation.
  const escaped = text.replace(/ /g, '%s').replace(/(["'&|<>()$`\\])/g, '\\$1');
  adb(['shell', 'input', 'text', escaped]);
  hideKeyboard();
}

/**
 * Closes the soft keyboard if it is showing.
 *
 * KEYCODE_ESCAPE does not dismiss Android's IME -- the keyboard stays up and
 * covers the lower half of the screen, so taps aimed at anything down there
 * land on keys instead. BACK closes it, but only send BACK when the IME is
 * actually shown, since otherwise it navigates away from the screen.
 */
export function hideKeyboard() {
  try {
    const state = adb(['shell', 'dumpsys', 'input_method']);
    if (/mInputShown=true/.test(state)) {
      adb(['shell', 'input', 'keyevent', 'KEYCODE_BACK']);
      return true;
    }
  } catch {
    // Fall through: not being able to read IME state is not fatal.
  }
  return false;
}

export function screenshot(name) {
  adb(['shell', 'screencap', '-p', '/sdcard/shot.png']);
  const out = join('test-results', `native-${name}.png`);
  adb(['pull', '/sdcard/shot.png', out]);
  return out;
}

export function currentActivity() {
  const out = adb(['shell', 'dumpsys', 'activity', 'activities']);
  const m = out.match(/topResumedActivity=ActivityRecord\{[^ ]+ [^ ]+ ([^ }]+)/);
  return m ? m[1] : 'unknown';
}

export function relaunch(pkg = 'com.orianvar.bayitshave', metro = 'http://localhost:8081') {
  adb(['reverse', 'tcp:8081', 'tcp:8081']);
  adb(['shell', 'am', 'force-stop', pkg]);
  adb([
    'shell',
    'am',
    'start',
    '-a',
    'android.intent.action.VIEW',
    '-d',
    `bayitshave://expo-development-client/?url=${encodeURIComponent(metro)}`,
    pkg,
  ]);
}

export function dismissDevMenu() {
  adb(['shell', 'input', 'keyevent', 'KEYCODE_ESCAPE']);
}

export function back() {
  adb(['shell', 'input', 'keyevent', 'KEYCODE_BACK']);
}

export { adb };
