const { test, expect } = require('@playwright/test');

// ANSI color codes
const green = '\x1b[32m';
const red = '\x1b[31m';
const dim = '\x1b[2m';
const reset = '\x1b[0m';
const bold = '\x1b[1m';

test('Backbone QUnit tests', async ({ page }) => {
  // Log page errors
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message, err.stack));

  // Collect test results via QUnit callbacks
  await page.addInitScript(() => {
    window.__qunitTests = [];
    window.__qunitModules = {};
  });

  // Navigate to the QUnit test page
  await page.goto('/test/index.html');

  // Hook into QUnit after it loads
  await page.evaluate(() => {
    QUnit.testDone(details => {
      window.__qunitTests.push({
        module: details.module,
        name: details.name,
        failed: details.failed,
        passed: details.passed,
        total: details.total,
        runtime: details.runtime
      });
    });
  });

  // Wait for QUnit to complete
  await page.waitForFunction(() => {
    return window.QUnit && window.QUnit.config.started && !window.QUnit.config.blocking;
  }, { timeout: 60000 });

  // Get all test results
  const testResults = await page.evaluate(() => window.__qunitTests);
  const stats = await page.evaluate(() => window.QUnit.config.stats);

  // Group by module
  const modules = {};
  for (const t of testResults) {
    if (!modules[t.module]) modules[t.module] = [];
    modules[t.module].push(t);
  }

  // Print results grouped by module
  console.log('');
  for (const [moduleName, tests] of Object.entries(modules)) {
    console.log(`${bold}${moduleName}${reset}`);
    for (const t of tests) {
      const icon = t.failed === 0 ? `${green}✓${reset}` : `${red}✗${reset}`;
      const time = `${dim}(${t.runtime}ms)${reset}`;
      const name = t.failed === 0 ? t.name : `${red}${t.name}${reset}`;
      console.log(`  ${icon} ${name} ${time}`);
    }
    console.log('');
  }

  // Summary
  const passed = stats.all - stats.bad;
  const failed = stats.bad;
  const summary = failed === 0
    ? `${green}${bold}✓ ${passed} assertions passed${reset}`
    : `${red}${bold}✗ ${failed} failed${reset}, ${green}${passed} passed${reset}`;
  console.log(summary);

  // Show failure details if any
  if (failed > 0) {
    const failureDetails = await page.evaluate(() => {
      const details = [];
      document.querySelectorAll('#qunit-tests > li.fail').forEach(li => {
        const module = li.querySelector('.module-name')?.textContent || '';
        const test = li.querySelector('.test-name')?.textContent || '';
        const assertions = [];
        li.querySelectorAll('.fail .test-message').forEach(msg => {
          assertions.push(msg.textContent);
        });
        details.push({ module, test, assertions });
      });
      return details;
    });
    console.log('\nFailure details:');
    failureDetails.forEach(f => {
      console.log(`  ${red}✗${reset} ${f.module}: ${f.test}`);
      f.assertions.forEach(a => console.log(`      ${a}`));
    });
  }
  console.log('');

  // Assert no failures
  expect(failed, `${failed} tests failed`).toBe(0);
});
