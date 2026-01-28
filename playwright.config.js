// @ts-check
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 60000,
  retries: 0,
  reporter: [['list']],
  use: {
    headless: true,
    baseURL: 'http://localhost:9876'
  },
  webServer: {
    command: 'npx http-server -p 9876 -s',
    url: 'http://localhost:9876/test/index.html',
    timeout: 10000,
    reuseExistingServer: !process.env.CI
  }
});
