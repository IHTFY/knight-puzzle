const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ context }) => {
  // Nothing outside the local server is requested: no real ad, no loader.
  await context.route(/^https?:\/\/(?!127\.0\.0\.1:8766(?:\/|$))/, (route) => route.abort());
});

test('the focused square keeps focus when a resize redraws the board', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/');
  await page.locator('[data-square="h8"]').focus();
  for (const key of ['ArrowLeft', 'ArrowDown', 'ArrowDown']) await page.keyboard.press(key);
  const before = await page.locator('[data-square="g6"]').elementHandle();
  await expect(page.locator('[data-square="g6"]')).toBeFocused();

  await page.setViewportSize({ width: 1280, height: 768 });
  await expect.poll(() => before.evaluate((square) => square.isConnected)).toBe(false);
  await expect(page.locator('[data-square="g6"]')).toBeFocused();

  await page.keyboard.press('Enter');
  await expect(page.locator('#moveCount')).toHaveText('1');
  await expect(page.locator('[data-square="g6"]')).toBeFocused();
});

test('a resize leaves focus alone when it is outside the board', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/');
  const before = await page.locator('[data-square="g6"]').elementHandle();
  await page.locator('#statsButton').focus();
  await page.setViewportSize({ width: 1280, height: 768 });
  await expect.poll(() => before.evaluate((square) => square.isConnected)).toBe(false);
  await expect(page.locator('#statsButton')).toBeFocused();
});
