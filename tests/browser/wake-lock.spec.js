import { test, expect } from '@playwright/test';

test('joined phones show wake-lock state, retry denial/release, and release when leaving', async ({ browser, page: host }) => {
  await host.goto('/tv');
  await host.getByRole('button', { name: 'Establish an operation' }).click();
  const code = await host.locator('.room-code').innerText();
  await expect(host.locator('.screen-awake')).toHaveCount(0);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    await context.addInitScript(() => {
      window.wakeRequests = 0; window.wakeReleases = 0;
      Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: async () => {
        window.wakeRequests++;
        if (window.wakeRequests === 1) throw new Error('NotAllowedError');
        const lock = new EventTarget(); lock.released = false;
        lock.release = async () => {
          if (lock.released) return;
          lock.released = true; window.wakeReleases++; lock.dispatchEvent(new Event('release'));
        };
        window.releaseScreenLock = () => lock.release();
        return lock;
      } } });
    });
    const phone = await context.newPage();
    await phone.goto(`/play?room=${code}`);
    await expect(phone.locator('.screen-awake')).toHaveCount(0);
    await phone.getByLabel('YOUR CODENAME').fill('Wake tester');
    await phone.getByRole('button', { name: 'Join the resistance' }).click();
    await expect(phone.locator('.screen-awake')).toContainText('Stay-awake was blocked');
    await phone.getByRole('button', { name: 'Retry screen stay-awake' }).click();
    await expect(phone.locator('.screen-awake')).toContainText('Screen stay-awake is on');
    await phone.evaluate(() => window.releaseScreenLock());
    await expect(phone.locator('.screen-awake')).toContainText('released by your browser');
    await phone.getByRole('button', { name: 'Retry screen stay-awake' }).click();
    await expect(phone.locator('.screen-awake')).toContainText('Screen stay-awake is on');
    expect(await phone.evaluate(() => window.wakeRequests)).toBe(3);
    await phone.getByRole('button', { name: 'Disconnect controller' }).click();
    await expect(phone.locator('.screen-awake')).toHaveCount(0);
    await expect.poll(() => phone.evaluate(() => window.wakeReleases)).toBe(2);
  } finally { await context.close(); }
});
