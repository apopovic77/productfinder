import { test, expect } from '@playwright/test';

test('debug pivot layout', async ({ page }) => {
  // Navigate to the app
  await page.goto('http://localhost:5173');
  
  // Wait for products to load
  await page.waitForSelector('canvas', { timeout: 10000 });
  await page.waitForTimeout(2000); // Wait for layout to settle
  
  // Take a screenshot
  await page.screenshot({ path: 'tests/screenshots/debug-pivot-layout.png', fullPage: true });
  
  // Get console logs
  const logs: string[] = [];
  page.on('console', msg => logs.push(msg.text()));
  
  // Reload to get fresh logs
  await page.reload();
  await page.waitForTimeout(3000);
  
  // Print logs related to Gloves
  console.log('\n=== GLOVES DEBUG OUTPUT ===');
  const glovesLogs = logs.filter(log => log.includes('Gloves') || log.includes('Product'));
  glovesLogs.forEach(log => console.log(log));
  
  // Check if we have the expected console output
  expect(logs.some(log => log.includes('Group Gloves'))).toBeTruthy();
});

