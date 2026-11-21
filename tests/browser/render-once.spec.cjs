const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ context }) => {
  // Nothing outside the local server is requested: no real ad, no loader.
  await context.route(/^https?:\/\/(?!127\.0\.0\.1:8766(?:\/|$))/, (route) => route.abort());
});

// Each highlight pass writes tabindex on every square, so the writes on a square
// the knight never visits count the passes.
async function countPasses(page) {
  await page.evaluate(() => {
    window.highlightPasses = 0;
    new MutationObserver((records) => {
      window.highlightPasses += records.length;
    }).observe(document.querySelector('[data-square="a1"]'), {
      attributes: true,
      attributeFilter: ['tabindex'],
    });
  });
  return () => page.evaluate(() => window.highlightPasses);
}

test('a tap renders the highlights once', async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 915 });
  await page.goto('/');
  const passes = await countPasses(page);

  await page.locator('[data-square="g6"]').click();
  await expect(page.locator('#moveCount')).toHaveText('1');
  await expect(page.locator('[data-square="g6"] img')).toBeVisible();
  expect(await passes()).toBe(1);
});

test('a drag renders the highlights once', async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 915 });
  await page.goto('/');
  const passes = await countPasses(page);

  await page.locator('[data-square="h8"] img').dragTo(page.locator('[data-square="g6"]'));
  await expect(page.locator('#moveCount')).toHaveText('1');
  // The piece lands in its square after the snap animation, right before onSnapEnd.
  await expect(page.locator('[data-square="g6"] img')).toBeVisible();
  await page.evaluate(() => new Promise(requestAnimationFrame));
  expect(await passes()).toBe(1);
});

test('the highlights follow a tapped move', async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 915 });
  await page.goto('/');
  await page.locator('[data-square="g6"]').click();
  await expect(page.locator('[data-square="g6"]')).toHaveAttribute('tabindex', '0');
  await expect(page.locator('[data-square="h8"]')).toHaveAttribute('tabindex', '-1');
  await expect(page.locator('[data-square="f4"]')).toHaveClass(/knight-available/);
  await expect(page.locator('[data-square="g6"]')).toBeFocused();
});
