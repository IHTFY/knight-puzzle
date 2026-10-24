const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/browser',
  use: { baseURL: 'http://127.0.0.1:8766' },
  webServer: {
    command: 'python3 -m http.server 8766 --bind 127.0.0.1',
    url: 'http://127.0.0.1:8766',
    stderr: 'ignore',
    reuseExistingServer: !process.env.CI,
  },
});
