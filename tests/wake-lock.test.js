import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createScreenWakeLock } from '../src/screen-wake-lock.js';

const settle = () => new Promise(resolve => setImmediate(resolve));
class Sentinel extends EventTarget {
  released = false;
  async release() { this.released = true; this.dispatchEvent(new Event('release')); }
}
function setup({ secureContext = true, request, supported = true } = {}) {
  const document = new EventTarget();
  document.visibilityState = 'visible';
  const sentinels = []; const states = []; const calls = [];
  const navigator = supported ? { wakeLock: { request: async type => {
    calls.push(type);
    const lock = request ? await request() : new Sentinel();
    sentinels.push(lock); return lock;
  } } } : {};
  const controller = createScreenWakeLock({ navigator, document, secureContext, onStatus: s => states.push(s) });
  const visibility = state => { document.visibilityState = state; document.dispatchEvent(new Event('visibilitychange')); };
  return { controller, document, states, sentinels, calls, visibility };
}

test('phone wake lock acquires screen lock, releases on hide, reacquires on return and cleans up', async () => {
  const x = setup(); x.controller.start(); await settle();
  assert.deepEqual(x.calls, ['screen']); assert.equal(x.states.at(-1), 'active');
  x.visibility('hidden'); await settle();
  assert.equal(x.sentinels[0].released, true); assert.equal(x.states.at(-1), 'hidden');
  x.visibility('visible'); await settle();
  assert.equal(x.calls.length, 2); assert.equal(x.states.at(-1), 'active');
  x.controller.stop(); await settle();
  assert.equal(x.sentinels[1].released, true);
  x.visibility('hidden'); x.visibility('visible'); await settle();
  assert.equal(x.calls.length, 2);
});

test('blocked wake lock is nonfatal and can be retried after a user gesture', async () => {
  let fail = true;
  const x = setup({ request: () => { if (fail) throw new Error('NotAllowedError'); return new Sentinel(); } });
  x.controller.start(); await settle(); assert.equal(x.states.at(-1), 'denied');
  fail = false; await x.controller.retry(); assert.equal(x.states.at(-1), 'active');
  x.controller.stop();
});

test('unsupported or insecure contexts show an honest fallback without requesting a lock', async () => {
  for (const [options, state] of [[{ secureContext: false }, 'insecure'], [{ supported: false }, 'unsupported']]) {
    const x = setup(options); x.controller.start(); await settle();
    assert.equal(x.states.at(-1), state); assert.equal(x.calls.length, 0); x.controller.stop();
  }
});

test('browser-initiated release updates status and manual retry acquires a fresh lock', async () => {
  const x = setup(); x.controller.start(); await settle();
  await x.sentinels[0].release(); assert.equal(x.states.at(-1), 'released');
  await x.controller.retry(); assert.equal(x.calls.length, 2); assert.equal(x.states.at(-1), 'active');
  x.controller.stop();
});

test('a pending request resolving after departure is released without updating unmounted UI', async () => {
  let resolve;
  const x = setup({ request: () => new Promise(r => { resolve = r; }) });
  x.controller.start(); x.controller.stop();
  const before = x.states.length; const lock = new Sentinel(); resolve(lock); await settle();
  assert.equal(lock.released, true); assert.equal(x.states.length, before);
});

test('returning while a background request is being released still reacquires', async () => {
  let resolveRequest; let finishRelease; let count = 0;
  const old = new Sentinel();
  old.release = () => new Promise(resolve => { finishRelease = () => { old.released = true; resolve(); }; });
  const x = setup({ request: () => ++count === 1 ? new Promise(resolve => { resolveRequest = resolve; }) : new Sentinel() });
  x.controller.start(); x.visibility('hidden'); resolveRequest(old); await settle();
  x.visibility('visible'); finishRelease(); await settle();
  assert.equal(x.calls.length, 2); assert.equal(x.states.at(-1), 'active');
  x.controller.stop();
});

test('no request is made in a hidden tab until it becomes visible', async () => {
  const x = setup(); x.document.visibilityState = 'hidden'; x.controller.start(); await settle();
  assert.equal(x.calls.length, 0); assert.equal(x.states.at(-1), 'hidden');
  x.visibility('visible'); await settle();
  assert.equal(x.states.at(-1), 'active'); x.controller.stop();
});
