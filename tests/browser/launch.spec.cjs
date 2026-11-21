const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ context }) => {
  // Nothing outside the local server is requested: no real ad, no loader.
  await context.route(/^https?:\/\/(?!127\.0\.0\.1:8766(?:\/|$))/, (route) => route.abort());
});

// Playwright has no display-mode emulation, so the page sees itself as the installed app.
// The page records whether it ever entered the launch state and every animation it starts.
// With `hold`, the exit's animations are paused, at their 'start' or 'end', instead of playing.
async function installedApp(page, { hold, mode = 'standalone' } = {}) {
  await page.addInitScript(({ hold, mode }) => {
    const real = window.matchMedia.bind(window);
    window.matchMedia = (query) =>
      query.includes('display-mode')
        ? { matches: query.includes(mode), media: query, addEventListener() {}, removeEventListener() {} }
        : real(query);
    window.startedLaunching = false;
    new MutationObserver(() => {
      if (document.documentElement.classList.contains('launching')) window.startedLaunching = true;
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ['class'] });
    window.started = [];
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (keyframes, options) {
      window.started.push({ target: this.id || this.className, duration: options.duration });
      return animate.call(this, keyframes, options);
    };
    if (!hold) return;
    let launchExit;
    Object.defineProperty(window, 'launchExit', {
      get: () => launchExit,
      set(exit) {
        launchExit = (play) =>
          exit((overlay) => {
            const animations = play(overlay);
            for (const animation of animations) {
              animation.pause();
              if (hold === 'end') animation.currentTime = animation.effect.getComputedTiming().endTime;
            }
            window.launchHeld = true;
            return animations;
          });
      },
    });
  }, { hold, mode });
}

const launching = (page) => page.evaluate(() => document.documentElement.classList.contains('launching'));

test('a browser tab shows the game without the launch copy', async ({ page }) => {
  await page.goto('/');
  expect(await launching(page)).toBe(false);
  await expect(page.locator('#launch')).toBeHidden();
  await expect(page.locator('.brand img')).toBeVisible();
});

for (const size of [{ width: 360, height: 722 }, { width: 800, height: 360 }]) {
  test(`the helmet lands on the header logo at ${size.width}x${size.height}`, async ({ page }) => {
    await page.setViewportSize(size);
    await installedApp(page, { hold: 'end' });
    await page.goto('/');
    await page.waitForFunction(() => window.launchHeld);
    const [icon, logo] = await page.evaluate(() =>
      ['#launch-icon', '.brand img'].map((selector) => {
        const { left, top, width, height } = document.querySelector(selector).getBoundingClientRect();
        return { left, top, width, height };
      }),
    );
    for (const key of Object.keys(logo)) expect(Math.abs(icon[key] - logo[key])).toBeLessThan(1);
  });
}

test('the launch plays once, then leaves the game as a tab shows it', async ({ page }) => {
  await installedApp(page);
  await page.goto('/');
  expect(await page.evaluate(() => window.startedLaunching)).toBe(true);
  await expect(page.locator('#launch')).toHaveCount(0, { timeout: 3000 });
  expect(await launching(page)).toBe(false);
  await expect(page.locator('.brand img')).toHaveCSS('opacity', '1');
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);

  await page.reload();
  expect(await launching(page)).toBe(false);
  await expect(page.locator('#launch')).toBeHidden();
});

test('a tap skips to the end', async ({ page }) => {
  // Paused at the start, the exit ends only through the tap.
  await installedApp(page, { hold: 'start' });
  await page.goto('/');
  await page.waitForFunction(() => window.launchHeld);
  await page.locator('#launch').dispatchEvent('pointerdown');
  await expect(page.locator('#launch')).toHaveCount(0);
  expect(await launching(page)).toBe(false);
  await expect(page.locator('.brand img')).toHaveCSS('opacity', '1');
});

for (const [name, act] of [
  ['a key', (page) => page.keyboard.press('Tab')],
  ['a resize, which would move the landing spot,', (page) => page.setViewportSize({ width: 800, height: 360 })],
]) {
  test(`${name} skips to the end`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 722 });
    await installedApp(page, { hold: 'start' });
    await page.goto('/');
    await page.waitForFunction(() => window.launchHeld);
    await act(page);
    await expect(page.locator('#launch')).toHaveCount(0);
    expect(await launching(page)).toBe(false);
  });
}

test('a tap before the game is ready ends the launch as soon as it is', async ({ page }) => {
  let release;
  const held = new Promise((resolve) => (release = resolve));
  await page.route('**/main.js', async (route) => {
    await held;
    await route.continue();
  });
  await installedApp(page);
  const loaded = page.goto('/');
  await page.locator('#launch').waitFor();
  await page.locator('#launch').dispatchEvent('pointerdown');
  release();
  await loaded;
  await expect(page.locator('#launch')).toHaveCount(0);
  expect(await page.evaluate(() => window.started)).toEqual([]);
});

test('the copy still goes if the exit fails to start', async ({ page }) => {
  await installedApp(page);
  await page.addInitScript(() => {
    Element.prototype.animate = () => {
      throw new Error('no animations');
    };
  });
  await page.goto('/');
  expect(await page.evaluate(() => window.startedLaunching)).toBe(true);
  await expect(page.locator('#launch')).toHaveCount(0, { timeout: 1000 });
  expect(await launching(page)).toBe(false);
});

test('a stalled exit still ends, and leaves the logo showing', async ({ page }) => {
  await installedApp(page, { hold: 'start' });
  await page.goto('/');
  await page.waitForFunction(() => window.launchHeld);
  await expect(page.locator('#launch')).toHaveCount(0, { timeout: 6000 });
  expect(await launching(page)).toBe(false);
  await expect(page.locator('.brand img')).toHaveCSS('opacity', '1');
});

test('a fullscreen browser tab is not the installed app', async ({ page }) => {
  await installedApp(page, { mode: 'fullscreen' });
  await page.goto('/');
  expect(await page.evaluate(() => window.startedLaunching)).toBe(false);
  await expect(page.locator('#launch')).toBeHidden();
});

test('reduced motion gets a short fade and no flight', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await installedApp(page);
  await page.goto('/');
  await expect(page.locator('#launch')).toHaveCount(0);
  expect(await page.evaluate(() => window.startedLaunching)).toBe(true);
  expect(await page.evaluate(() => window.started)).toEqual([{ target: 'launch', duration: 200 }]);
});
