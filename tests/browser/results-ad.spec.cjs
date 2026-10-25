const { test, expect } = require('@playwright/test');

// Stands in for the shared loader (a stored token counts as a valid ad-free purchase): fills a box with a unit of the size it asks for, after a short wait.
const LOADER_STUB = `
  window.__ads = [];
  window.ihtfyAds = {
    adFree: async () => Boolean(localStorage.getItem('ihtfy-ad-free')),
    show(box, key) {
      const [width, height] = (box.dataset.adSize || '300x250').split('x');
      window.__ads.push({ key, slot: box.dataset.adSlot, size: box.dataset.adSize, inDialog: Boolean(box.closest('dialog')) });
      setTimeout(() => {
        if (!box.isConnected) return;
        const ins = document.createElement('ins');
        ins.className = 'adsbygoogle';
        ins.style.cssText = 'display:inline-block;width:' + width + 'px;height:' + height + 'px;background:#555';
        box.appendChild(ins);
      }, 150);
    },
  };
`;

test.beforeEach(async ({ context }) => {
  // Nothing outside the local server is requested: no real ad, and the loader is the stub.
  await context.route(/^https?:\/\/(?!127\.0\.0\.1:8766(?:\/|$))/, (route) =>
    route.request().url() === 'https://ihtfy.com/ads/v1.js'
      ? route.fulfill({ contentType: 'text/javascript', body: LOADER_STUB })
      : route.abort(),
  );
});

// Shortest knight route through every target, found in the page from its own rules.
async function finishTour(page) {
  await page.evaluate(() => {
    const free = [];
    for (let file = 0; file < 8; file++)
      for (let rank = 1; rank <= 8; rank++) {
        const square = String.fromCharCode(97 + file) + rank;
        if (!inQVision(square)) free.push(square);
      }
    const route = (from, to) => {
      const queue = [[from]];
      const seen = new Set([from]);
      for (const steps of queue) {
        const last = steps.at(-1);
        if (last === to) return steps.slice(1);
        for (const square of free)
          if (!seen.has(square) && legalKnight(last, square)) {
            seen.add(square);
            queue.push([...steps, square]);
          }
      }
    };
    let at = targets[0].square;
    for (const target of targets.slice(1))
      for (const square of route(at, target.square)) {
        moveTo(square);
        at = square;
      }
  });
  await expect(page.locator('#solvedPanel')).toBeVisible();
}

const rect = (page, selector) =>
  page.locator(selector).evaluate((el) => {
    const { left, top, right, bottom } = el.getBoundingClientRect();
    return { left, top, right, bottom };
  });

async function measure(page) {
  const box = await rect(page, '#adBox');
  const privacy = await rect(page, '.ad a');
  const again = await rect(page, '#playAgain');
  const back = await rect(page, '#closeSolved');
  const heading = await rect(page, '#solvedTitle');
  const text = await rect(page, '#solvedText');
  return { box, privacy, again, back, heading, text };
}

const sizes = [
  { width: 360, height: 640, ad: '300x250' },
  { width: 390, height: 750, ad: '300x250' },
  { width: 412, height: 800, ad: '300x250' },
  { width: 1280, height: 800, ad: '300x250' },
  { width: 375, height: 560, ad: '320x100' },
  { width: 360, height: 400, ad: '320x50' },
];

for (const { width, height, ad } of sizes) {
  test(`the results and a ${ad} ad are all in view at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/?adtest=on');
    await page.keyboard.press('Shift'); // The first key press lets the ad code start.
    expect(await page.evaluate(() => window.__ads?.length ?? 0)).toBe(0);
    await finishTour(page);
    const before = await measure(page);
    await expect(page.locator('#adBox ins')).toHaveCount(1);
    const after = await measure(page);
    // The box and everything around it stay put when the ad fills.
    expect(after).toEqual(before);
    const [adWidth, adHeight] = ad.split('x').map(Number);
    expect(after.box.right - after.box.left).toBe(adWidth);
    expect(after.box.bottom - after.box.top).toBe(adHeight);
    const filled = await page.locator('#adBox ins').boundingBox();
    expect([filled.width, filled.height]).toEqual([adWidth, adHeight]);
    // Everything is in view: no scrolling, nothing below the window or left of it.
    const { box, privacy, again, back, heading, text } = after;
    for (const r of [box, privacy, again, back, heading, text]) {
      expect(r.left).toBeGreaterThanOrEqual(0);
      expect(r.top).toBeGreaterThanOrEqual(0);
      expect(r.right).toBeLessThanOrEqual(width);
      expect(r.bottom).toBeLessThanOrEqual(height);
    }
    expect(await page.locator('#solvedPanel').evaluate((el) => el.scrollHeight <= el.clientHeight)).toBe(true);
    // At least 50px from the ad box to every link and button, and the result sits above the ad.
    expect(privacy.top - box.bottom).toBeGreaterThanOrEqual(50);
    expect(again.top - box.bottom).toBeGreaterThanOrEqual(50);
    expect(back.top - box.bottom).toBeGreaterThanOrEqual(50);
    expect(box.top - text.bottom).toBeGreaterThanOrEqual(0);
    const headerButtons = await page.locator('.header-tools').evaluate((el) => getComputedStyle(el).visibility);
    expect(headerButtons).toBe('hidden');
    // Not in a dialog, and only this ad is on the page on a phone.
    const [request] = await page.evaluate(() => window.__ads);
    expect(request).toMatchObject({ slot: '6470163205', size: ad, inDialog: false });
    expect(await page.locator('dialog[open]').count()).toBe(0);
    console.log(`${width}x${height} ${ad} box ${JSON.stringify(box)} gap-to-privacy ${privacy.top - box.bottom} gap-to-buttons ${again.top - box.bottom} buttons-bottom ${again.bottom}`);
  });
}

test('the play screen on a phone has no ad and requests none', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 750 });
  await page.goto('/?adtest=on');
  await page.keyboard.press('Shift');
  await page.evaluate(() => moveTo('g6'));
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__ads?.length ?? 0)).toBe(0);
  expect(await page.locator('ins').count()).toBe(0);
  await expect(page.locator('#playAd')).toBeHidden();
  await expect(page.locator('#adBox')).toBeHidden();
});

test('Back to board empties the box, and the next result gets a new one', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 750 });
  await page.goto('/?adtest=on');
  await page.keyboard.press('Shift');
  await finishTour(page);
  await expect(page.locator('#adBox ins')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.locator('#solvedPanel')).toBeHidden();
  await expect(page.locator('#board .square-55d63').first()).toBeVisible();
  expect(await page.locator('ins').count()).toBe(0);
  await page.evaluate(() => document.getElementById('confirmReset').click());
  await finishTour(page);
  await expect(page.locator('#adBox ins')).toHaveCount(1);
  const keys = await page.evaluate(() => window.__ads.map((ad) => ad.key));
  expect(keys).toHaveLength(2);
  expect(keys[0]).not.toBe(keys[1]);
});

test('a buyer gets no results box, no reserved space and no request', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 750 });
  await page.addInitScript(() => localStorage.setItem('ihtfy-ad-free', 'token'));
  await page.goto('/?adtest=on');
  await page.keyboard.press('Shift');
  await finishTour(page);
  await expect(page.locator('.ad')).toBeHidden();
  expect(await page.locator('#adBox').evaluate((el) => el.offsetHeight)).toBe(0);
  expect(await page.evaluate(() => window.__ads?.length ?? 0)).toBe(0);
  expect(await page.locator('ins').count()).toBe(0);
  const again = await rect(page, '#playAgain');
  expect(again.bottom).toBeLessThanOrEqual(750);
});

test('turning the phone does not resize the box once the ad is placed', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 750 });
  await page.goto('/?adtest=on');
  await page.keyboard.press('Shift');
  await finishTour(page);
  await expect(page.locator('#adBox ins')).toHaveCount(1);
  await page.setViewportSize({ width: 750, height: 390 });
  const box = await page.locator('#adBox').boundingBox();
  expect([box.width, box.height]).toEqual([300, 250]);
});
