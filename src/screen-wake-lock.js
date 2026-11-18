// Kept separate from React so lifecycle and asynchronous release races are testable.
export function createScreenWakeLock({ navigator, document, secureContext, onStatus }) {
  let active = false;
  let pending = false;
  let lock = null;
  const status = value => { if (active) onStatus(value); };
  function release() {
    const previous = lock;
    lock = null;
    if (previous) Promise.resolve().then(() => previous.release()).catch(() => {});
  }
  async function acquire() {
    if (!active) return;
    if (!secureContext) { status('insecure'); return; }
    if (!navigator.wakeLock?.request) { status('unsupported'); return; }
    if (document.visibilityState !== 'visible') { status('hidden'); return; }
    if (pending || lock) return;
    pending = true;
    status('requesting');
    let discarded = false;
    try {
      const sentinel = await navigator.wakeLock.request('screen');
      if (!active || document.visibilityState !== 'visible') {
        discarded = true;
        await sentinel.release();
        return;
      }
      lock = sentinel;
      sentinel.addEventListener('release', () => {
        if (lock !== sentinel) return;
        lock = null;
        status(document.visibilityState === 'visible' ? 'released' : 'hidden');
      }, { once: true });
      if (sentinel.released) { lock = null; status('released'); }
      else status('active');
    } catch {
      status(document.visibilityState === 'visible' ? 'denied' : 'hidden');
    } finally {
      pending = false;
      // Visibility can return while an obsolete request is still being released.
      if (discarded && active && document.visibilityState === 'visible') acquire();
    }
  }
  function visibilityChanged() {
    if (document.visibilityState === 'visible') acquire();
    else { release(); status('hidden'); }
  }
  return {
    start() { active = true; document.addEventListener('visibilitychange', visibilityChanged); acquire(); },
    retry: acquire,
    stop() { active = false; document.removeEventListener('visibilitychange', visibilityChanged); release(); },
  };
}
