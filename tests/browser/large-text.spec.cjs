const { test, expect } = require('@playwright/test');
const { CONTROLS, open, expectInView, expectTextInside } = require('./fit.cjs');

// Chrome's minimum font size stands in for a phone's larger text setting.
test.use({ launchOptions: { args: ['--blink-settings=minimumFontSize=22'] } });

test.beforeEach(async ({ context }) => {
  // Nothing outside the local server is requested: no real ad, no loader.
  await context.route(/^https?:\/\/(?!127\.0\.0\.1:8766(?:\/|$))/, (route) => route.abort());
});

test('a narrow phone keeps each label inside its control', async ({ page }) => {
  await open(page, 320, 568);
  await expectInView(page, ['.board-wrap', ...CONTROLS]);
  await expectTextInside(page, '#showTarget .label', '#showTarget');
  await expectTextInside(page, '#showTarget .number', '#showTarget');
  await expectTextInside(page, '#timerDisplay', '#showTimer');
  await expectTextInside(page, '.metric .label', '.metric');
  await expectTextInside(page, '#reset', '#reset');
  await expectTextInside(page, '#showRoute span', '#showRoute');
  await expectTextInside(page, '#statsButton', '#statsButton');
});

test('a short phone on its side reaches Rewind, Reset and Stats by scrolling the controls', async ({ page }) => {
  await open(page, 320, 568);
  await page.locator('.square-g6').click();
  await page.setViewportSize({ width: 568, height: 320 });
  await expectInView(page, ['.board-wrap']);
  await page.locator('.panel').hover();
  await expect(async () => {
    await page.mouse.wheel(0, 400);
    await expectInView(page, ['#rewind', '#reset', '#statsButton']);
  }).toPass({ timeout: 5000 });
  await expect(page.locator('#moveCount')).toHaveText('1');
});

test('a short upright window keeps a quarter of its height for the board and scrolls the controls', async ({ page }) => {
  await open(page, 360, 400);
  const board = await page.locator('.board-wrap').boundingBox();
  expect(board.height).toBeGreaterThanOrEqual(400 / 4 - 0.5);
  await page.locator('.panel').hover();
  await expect(async () => {
    await page.mouse.wheel(0, 400);
    await expectInView(page, ['#rewind', '#reset', '#statsButton']);
  }).toPass({ timeout: 5000 });
});

test('the route length moves to a second line instead of spilling out of its button', async ({ page }) => {
  for (const [width, height] of [[320, 568], [568, 320]]) {
    await open(page, width, height);
    await page.locator('#showRoute').click();
    await expect(page.locator('#routeCount')).not.toBeEmpty();
    for (const part of ['.route-icon', '#showRoute span', '#routeCount']) {
      const inner = await page.locator(part).boundingBox();
      const outer = await page.locator('#showRoute').boundingBox();
      expect(inner.x, part).toBeGreaterThanOrEqual(outer.x - 0.5);
      expect(inner.x + inner.width, part).toBeLessThanOrEqual(outer.x + outer.width + 0.5);
      expect(inner.y + inner.height, part).toBeLessThanOrEqual(outer.y + outer.height + 0.5);
    }
  }
});
