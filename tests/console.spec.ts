import { test } from '@playwright/test';

test('check console logs', async ({ page }) => {
  const logs: string[] = [];
  
  page.on('console', msg => {
    logs.push(`[${msg.type()}] ${msg.text()}`);
    console.log(`[${msg.type()}] ${msg.text()}`);
  });
  
  await page.goto('/');
  await page.waitForTimeout(5000);
  
  console.log('\n=== All Console Logs ===');
  logs.forEach(log => console.log(log));
});

