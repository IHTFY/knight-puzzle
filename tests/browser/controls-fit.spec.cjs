const { test, expect } = require('@playwright/test');
const { CONTROLS, open, expectInView, expectTextInside } = require('./fit.cjs');

test.beforeEach(async ({ context }) => {
  // Nothing outside the local server is requested: no real ad, no loader.
  await context.route(/^https?:\/\/(?!127\.0\.0\.1:8766(?:\/|$))/, (route) => route.abort());
});

test('a phone on its side shows every control without scrolling', async ({ page }) => {
  await open(page, 320, 568);
  await page.locator('.square-g6').click();
  await page.setViewportSize({ width: 568, height: 320 });
  await expectInView(page, ['.board-wrap', ...CONTROLS]);
  await expect(page.locator('#moveCount')).toHaveText('1');
});

test('a timer whose digits outgrow its card moves to a row of its own', async ({ page }) => {
  await open(page, 320, 568);
  await page.addStyleTag({ content: '#timerDisplay { font-size: 36px; }' });
  await expectTextInside(page, '#timerDisplay', '#showTimer');
  await expectInView(page, ['.board-wrap', ...CONTROLS]);
});

test('on a phone on its side, a time too wide for the panel breaks onto a second line', async ({ page }) => {
  await open(page, 568, 320);
  await page.addStyleTag({ content: '#timerDisplay { font-size: 64px; }' });
  await expectTextInside(page, '#timerDisplay', '#showTimer');
});
