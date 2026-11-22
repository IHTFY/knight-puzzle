const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ context }) => {
  // Nothing outside the local server is requested: no real ad, no loader.
  await context.route(/^https?:\/\/(?!127\.0\.0\.1:8766(?:\/|$))/, (route) => route.abort());
});

// Playwright has no display-mode emulation, so the page sees itself as the installed app.
// The page records whether it ever entered the launch state and every animation it starts.
// With `hold`, the exit's animations are paused, at their 'start' or 'end', instead of playing;
// tests that hold it wait for that, not for the page's load event, which a 2 s fallback could beat.
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
    await page.goto('/', { waitUntil: 'commit' });
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
  await page.goto('/', { waitUntil: 'commit' });
  await page.waitForFunction(() => window.launchHeld);
  await page.locator('#launch').dispatchEvent('pointerdown');
  // Well before the 4 s fallback would take the copy away.
  await expect(page.locator('#launch')).toHaveCount(0, { timeout: 1000 });
  expect(await launching(page)).toBe(false);
  await expect(page.locator('.brand img')).toHaveCSS('opacity', '1');
});

test.describe('on a touch screen', () => {
  test.use({ hasTouch: true });

  test('a tap that skips leaves the control under the finger alone, and the next tap works', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 722 });
    await installedApp(page, { hold: 'start' });
    await page.goto('/', { waitUntil: 'commit' });
    await page.waitForFunction(() => window.launchHeld);
    const control = page.locator('#queenVision');
    const before = await control.getAttribute('aria-pressed');
    const { x, y, width, height } = await control.boundingBox();
    await page.touchscreen.tap(x + width / 2, y + height / 2);
    await expect(page.locator('#launch')).toHaveCount(0, { timeout: 1000 });
    // The skip still counts as the player's first input.
    expect(await page.evaluate(() => Promise.race([firstInput.then(() => true), new Promise((r) => setTimeout(r, 100, false))]))).toBe(true);
    // The touch's click has had time to land.
    await page.waitForTimeout(300);
    await expect(control).toHaveAttribute('aria-pressed', before);

    await page.touchscreen.tap(x + width / 2, y + height / 2);
    await expect(control).not.toHaveAttribute('aria-pressed', before);
  });

  test('a second tap while the game loads keeps its own guard', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 722 });
    let release;
    const held = new Promise((resolve) => (release = resolve));
    await page.route('**/main.js', async (route) => {
      await held;
      await route.continue();
    });
    await installedApp(page);
    const loaded = page.goto('/');
    await page.locator('#launch').waitFor();
    const control = page.locator('#queenVision');
    const before = await control.getAttribute('aria-pressed');
    const { x, y, width, height } = await control.boundingBox();
    const point = { x: x + width / 2, y: y + height / 2 };
    await page.touchscreen.tap(point.x, point.y);
    // The second finger lands while the copy is still up and lifts once it has gone.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
    release();
    await loaded;
    await expect(page.locator('#launch')).toHaveCount(0, { timeout: 1000 });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(300);
    await expect(control).toHaveAttribute('aria-pressed', before);
  });

  test('a key pressed before the finger lifts keeps the guard', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 722 });
    await installedApp(page, { hold: 'start' });
    await page.goto('/', { waitUntil: 'commit' });
    await page.waitForFunction(() => window.launchHeld);
    const control = page.locator('#queenVision');
    const before = await control.getAttribute('aria-pressed');
    const { x, y, width, height } = await control.boundingBox();
    const point = { x: x + width / 2, y: y + height / 2 };
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
    await expect(page.locator('#launch')).toHaveCount(0, { timeout: 1000 });
    await page.keyboard.press('Shift');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(300);
    await expect(control).toHaveAttribute('aria-pressed', before);
  });

  test('a mouse click while the finger is down works, and the finger still lifts without one', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 722 });
    await installedApp(page, { hold: 'start' });
    await page.goto('/', { waitUntil: 'commit' });
    await page.waitForFunction(() => window.launchHeld);
    const control = page.locator('#queenVision');
    const before = await control.getAttribute('aria-pressed');
    const { x, y, width, height } = await control.boundingBox();
    const point = { x: x + width / 2, y: y + height / 2 };
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
    await expect(page.locator('#launch')).toHaveCount(0, { timeout: 1000 });
    await page.mouse.click(point.x, point.y);
    await expect(control).not.toHaveAttribute('aria-pressed', before);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(300);
    await expect(control).not.toHaveAttribute('aria-pressed', before);
  });

  // Each test touches down on the control under the copy, which ends the held launch.
  async function touchDown(page) {
    await page.setViewportSize({ width: 360, height: 722 });
    await installedApp(page, { hold: 'start' });
    await page.goto('/', { waitUntil: 'commit' });
    await page.waitForFunction(() => window.launchHeld);
    const control = page.locator('#queenVision');
    const before = await control.getAttribute('aria-pressed');
    const { x, y, width, height } = await control.boundingBox();
    const point = { x: x + width / 2, y: y + height / 2 };
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
    await expect(page.locator('#launch')).toHaveCount(0, { timeout: 1000 });
    return { control, before, point, cdp };
  }

  // Stands in for browsers that send a touch's click late, or without its pointer's id:
  // the real click is stopped before the page sees it, and the test sends its own.
  async function catchTouchClicks(page) {
    await page.addInitScript(() =>
      addEventListener(
        'click',
        (click) => {
          if (!click.isTrusted || click.pointerType !== 'touch') return;
          click.preventDefault();
          click.stopImmediatePropagation();
          window.caught = { target: click.target, pointerId: click.pointerId };
        },
        true,
      ),
    );
  }

  for (const [browser, shape] of [
    ['older Chromium', { type: 'PointerEvent', init: { pointerId: -1, pointerType: 'touch', detail: 0 } }],
    ['Safari', { type: 'MouseEvent', init: { detail: 1 } }],
  ]) {
    test(`a tap's click without its pointer's id, as ${browser} sends it, is still eaten`, async ({ page }) => {
      await catchTouchClicks(page);
      const { control, before, cdp } = await touchDown(page);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForFunction(() => window.caught);
      await page.evaluate(({ type, init }) => {
        window.caught.target.dispatchEvent(new window[type]('click', { bubbles: true, cancelable: true, ...init }));
      }, shape);
      await expect(control).toHaveAttribute('aria-pressed', before);
    });
  }

  test("a second finger down before the tap's click arrives keeps the guard", async ({ page }) => {
    await catchTouchClicks(page);
    const { control, before, point, cdp } = await touchDown(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForFunction(() => window.caught);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
    // The first tap's click, arriving late.
    await page.evaluate(() => {
      const { target, pointerId } = window.caught;
      target.dispatchEvent(new PointerEvent('click', { bubbles: true, cancelable: true, pointerId, pointerType: 'touch', detail: 1 }));
    });
    await expect(control).toHaveAttribute('aria-pressed', before);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  });

  test("a click without a pointer id while the finger is down isn't the finger's", async ({ page }) => {
    const { control, before, cdp } = await touchDown(page);
    await control.evaluate((button) =>
      button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 })),
    );
    await expect(control).not.toHaveAttribute('aria-pressed', before);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  });
});

test('a held press that skips leaves the next click alone', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 722 });
  await installedApp(page, { hold: 'start' });
  await page.goto('/', { waitUntil: 'commit' });
  await page.waitForFunction(() => window.launchHeld);
  const control = page.locator('#queenVision');
  const before = await control.getAttribute('aria-pressed');
  const { x, y, width, height } = await control.boundingBox();
  await page.mouse.move(x + width / 2, y + height / 2);
  // The press outlasts the copy, so its release makes no click.
  await page.mouse.down();
  await expect(page.locator('#launch')).toHaveCount(0, { timeout: 1000 });
  await page.mouse.up();
  await expect(control).toHaveAttribute('aria-pressed', before);
  await page.mouse.click(x + width / 2, y + height / 2);
  await expect(control).not.toHaveAttribute('aria-pressed', before);
});

test('a held press that skips leaves the next key alone', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 722 });
  await installedApp(page, { hold: 'start' });
  await page.goto('/', { waitUntil: 'commit' });
  await page.waitForFunction(() => window.launchHeld);
  const control = page.locator('#queenVision');
  const before = await control.getAttribute('aria-pressed');
  const { x, y, width, height } = await control.boundingBox();
  await page.mouse.move(x + width / 2, y + height / 2);
  await page.mouse.down();
  await expect(page.locator('#launch')).toHaveCount(0, { timeout: 1000 });
  await page.mouse.up();
  await expect(control).toHaveAttribute('aria-pressed', before);
  await control.focus();
  await page.keyboard.press('Enter');
  await expect(control).not.toHaveAttribute('aria-pressed', before);
});

test('a held press that skips leaves a click from assistive tech alone', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 722 });
  await installedApp(page, { hold: 'start' });
  await page.goto('/', { waitUntil: 'commit' });
  await page.waitForFunction(() => window.launchHeld);
  const control = page.locator('#queenVision');
  const before = await control.getAttribute('aria-pressed');
  const { x, y, width, height } = await control.boundingBox();
  await page.mouse.move(x + width / 2, y + height / 2);
  await page.mouse.down();
  await expect(page.locator('#launch')).toHaveCount(0, { timeout: 1000 });
  await page.mouse.up();
  await expect(control).toHaveAttribute('aria-pressed', before);
  // A screen reader's activation sends a click with no press before it.
  await control.evaluate((button) => button.click());
  await expect(control).not.toHaveAttribute('aria-pressed', before);
});

for (const [name, act] of [
  ['a key', (page) => page.keyboard.press('Tab')],
  ['a resize that moves the logo', (page) => page.setViewportSize({ width: 800, height: 360 })],
  ['a resize that moves the helmet', (page) => page.setViewportSize({ width: 360, height: 700 })],
]) {
  test(`${name} skips to the end`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 722 });
    await installedApp(page, { hold: 'start' });
    await page.goto('/', { waitUntil: 'commit' });
    await page.waitForFunction(() => window.launchHeld);
    await act(page);
    await expect(page.locator('#launch')).toHaveCount(0, { timeout: 1000 });
    expect(await launching(page)).toBe(false);
  });
}

test('a resize event that changes nothing keeps the flight', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 722 });
  await installedApp(page, { hold: 'start' });
  await page.goto('/', { waitUntil: 'commit' });
  await page.waitForFunction(() => window.launchHeld);
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  // Only a skip would take the paused copy away.
  await page.waitForTimeout(300);
  await expect(page.locator('#launch')).toHaveCount(1);
});

// A rejected ad-free token brings the rail back (the class goes); a valid one leaves it hidden.
for (const { width, height, moves } of [
  { width: 1920, height: 1080, moves: true },
  { width: 360, height: 722, moves: false },
]) {
  test(`the rail coming back at ${width}x${height} ${moves ? 'skips' : 'keeps'} the flight`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.addInitScript(() => localStorage.setItem('ihtfy-ad-free', 'token'));
    await installedApp(page, { hold: 'start' });
    await page.goto('/', { waitUntil: 'commit' });
    await page.waitForFunction(() => window.launchHeld);
    // Only a skip would take the paused copy away.
    await page.waitForTimeout(300);
    await expect(page.locator('#launch')).toHaveCount(1);
    await page.evaluate(() => document.documentElement.classList.remove('ad-free'));
    if (moves) {
      await expect(page.locator('#launch')).toHaveCount(0, { timeout: 1000 });
    } else {
      await page.waitForTimeout(300);
      await expect(page.locator('#launch')).toHaveCount(1);
    }
  });
}

test('slow game scripts leave the copy up, and a fallback that ends it leaves the game alone', async ({ page }) => {
  await installedApp(page);
  // The game's scripts arrive after the 4 s fallback.
  await page.route('**/jquery.min.js', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 4500));
    await route.continue();
  });
  await page.goto('/', { waitUntil: 'commit' });
  // They don't hold up the copy.
  await expect(page.locator('#launch')).toBeVisible({ timeout: 2000 });
  await page.waitForLoadState('load');
  expect(await page.evaluate(() => window.started)).toEqual([]);
  await expect(page.locator('#launch')).toHaveCount(0);
  await expect(page.locator('.brand img')).toHaveCSS('opacity', '1');
});

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
  await expect(page.locator('#launch')).toHaveCount(0, { timeout: 1000 });
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

test('a late start still gets the whole flight', async ({ page }) => {
  await installedApp(page);
  // The game becomes ready 3.5 s after the launch starts.
  await page.route('**/main.js', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 3500));
    await route.continue();
  });
  // Not waiting for the page's load event, which could come after the flight.
  await page.goto('/', { waitUntil: 'commit' });
  await page.waitForFunction(() => window.started?.length > 0);
  await page.waitForTimeout(800);
  await expect(page.locator('#launch')).toHaveCount(1);
  await expect(page.locator('#launch')).toHaveCount(0, { timeout: 2000 });
});

test('a stalled exit still ends, and leaves the logo showing', async ({ page }) => {
  await installedApp(page, { hold: 'start' });
  await page.goto('/', { waitUntil: 'commit' });
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
  await expect(page.locator('#launch')).toHaveCount(0, { timeout: 1000 });
  expect(await page.evaluate(() => window.startedLaunching)).toBe(true);
  expect(await page.evaluate(() => window.started)).toEqual([{ target: 'launch', duration: 200 }]);
});
