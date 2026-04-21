// @ts-check
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  retries: 0,
  reporter: 'list',

  use: {
    baseURL: 'http://localhost:3001',
    headless: true,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: [
    {
      command: 'node chess-text-api.js',
      url: 'http://localhost:3001/client',
      reuseExistingServer: true,
      timeout: 10_000,
    },
    {
      command: 'node server.js',
      url: 'http://localhost:3000/',
      reuseExistingServer: true,
      timeout: 10_000,
    },
  ],
});
