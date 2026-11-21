const { expect } = require('@playwright/test');

const CONTROLS = ['.metric', '#showTarget', '#showTimer', '#queenVision', '#knightVision', '#showRoute', '#rewind', '#reset', '#statsButton'];

async function open(page, width, height) {
  await page.setViewportSize({ width, height });
  await page.goto('/');
  await expect(page.locator('.square-55d63').first()).toBeVisible();
}

// Each element lies inside the window and, for the controls, inside the
// part of the panel that isn't scrolled out of sight.
async function expectInView(page, selectors) {
  const boxes = await page.evaluate((selectors) => {
    const view = { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
    const panel = document.querySelector('.panel');
    return selectors.map((selector) => {
      const element = document.querySelector(selector);
      return { selector, box: element.getBoundingClientRect().toJSON(), bounds: panel.contains(element) ? [view, panel.getBoundingClientRect().toJSON()] : [view] };
    });
  }, selectors);
  for (const { selector, box, bounds } of boxes) {
    for (const bound of bounds) {
      expect(box.left, selector).toBeGreaterThanOrEqual(bound.left - 0.5);
      expect(box.top, selector).toBeGreaterThanOrEqual(bound.top - 0.5);
      expect(box.right, selector).toBeLessThanOrEqual(bound.right + 0.5);
      expect(box.bottom, selector).toBeLessThanOrEqual(bound.bottom + 0.5);
    }
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
