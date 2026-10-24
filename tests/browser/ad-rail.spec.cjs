const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ context }) => {
  // Nothing outside the local server is requested: no real ad, no loader.
  await context.route(/^https?:\/\/(?!127\.0\.0\.1:8766(?:\/|$))/, (route) => route.abort());
});

test('a buyer never sees the ad rail or a board shift while the page script is slow', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.addInitScript(() => {
    localStorage.setItem('ihtfy-ad-free', 'token');
    // One sample per frame until the delayed script has run.
    window.__samples = [];
    const sample = () => {
      const rail = document.querySelector('#playAd');
      const app = document.querySelector('.app');
      if (rail && app) {
        const { left, width } = app.getBoundingClientRect();
        window.__samples.push({ rail: getComputedStyle(rail).display, left, width });
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await page.route('**/main.js', async (route) => {
    const response = await route.fetch();
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await route.fulfill({ response });
  });
  await page.goto('/');
  await page.waitForFunction(() => document.querySelector('#board .square-55d63'));
  await page.waitForTimeout(300);
  const samples = await page.evaluate(() => window.__samples);
  expect(samples.length).toBeGreaterThan(30);
  expect(samples.filter((frame) => frame.rail !== 'none')).toEqual([]);
  expect(new Set(samples.map((frame) => `${frame.left},${frame.width}`)).size).toBe(1);
});

test('a visitor without a token still gets the 160x600 rail at 1366x768', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/');
  await expect(page.locator('#playAdBox')).toHaveCSS('width', '160px');
  await expect(page.locator('#playAdBox')).toHaveCSS('height', '600px');
});
