const { expect } = require('@playwright/test');

const CONTROLS = ['.metric', '#showTarget', '#showTimer', '#queenVision', '#knightVision', '#showRoute', '#rewind', '#reset', '#statsButton'];

async function open(page, width, height) {
  await page.setViewportSize({ width, height });
  await page.goto('/');
  await expect(page.locator('.square-55d63').first()).toBeVisible();
}

// Each element lies inside the window.
async function expectInView(page, selectors) {
  const { width, height } = page.viewportSize();
  for (const selector of selectors) {
    const box = await page.locator(selector).first().boundingBox();
    expect(box.x, selector).toBeGreaterThanOrEqual(0);
    expect(box.y, selector).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, selector).toBeLessThanOrEqual(width + 0.5);
    expect(box.y + box.height, selector).toBeLessThanOrEqual(height + 0.5);
  }
}

// The text of `text` lies across no edge of `container`.
async function expectTextInside(page, text, container) {
  const [inner, outer] = await page.evaluate(
    ([text, container]) => {
      const range = document.createRange();
      range.selectNodeContents(document.querySelector(text));
      const { left, right } = range.getBoundingClientRect();
      const box = document.querySelector(container).getBoundingClientRect();
      return [{ left, right }, { left: box.left, right: box.right }];
    },
    [text, container],
  );
  expect(inner.left, text).toBeGreaterThanOrEqual(outer.left - 0.5);
  expect(inner.right, text).toBeLessThanOrEqual(outer.right + 0.5);
}

module.exports = { CONTROLS, open, expectInView, expectTextInside };
