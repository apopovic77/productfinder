import { test } from '@playwright/test';

test('debug productfinder', async ({ page }) => {
  const consoleMessages: any[] = [];
  const errors: any[] = [];
  
  page.on('console', msg => {
    consoleMessages.push({
      type: msg.type(),
      text: msg.text(),
      location: msg.location()
    });
  });
  
  page.on('pageerror', error => {
    errors.push({
      message: error.message,
      stack: error.stack
    });
  });
  
  page.on('requestfailed', request => {
    console.log('❌ Request failed:', request.url(), request.failure()?.errorText);
  });
  
  await page.goto('https://productfinder.arkturian.com');
  
  // Wait for everything to load
  await page.waitForTimeout(5000);
  
  console.log('\n=== Console Messages ===');
  consoleMessages.forEach(msg => {
    console.log(`[${msg.type}] ${msg.text}`);
  });
  
  console.log('\n=== Errors ===');
  errors.forEach(err => {
    console.log('❌', err.message);
    if (err.stack) console.log(err.stack);
  });
  
  // Check canvas state
  const canvasInfo = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return { exists: false };
    
    const rect = canvas.getBoundingClientRect();
    const style = window.getComputedStyle(canvas);
    
    return {
      exists: true,
      width: canvas.width,
      height: canvas.height,
      clientWidth: canvas.clientWidth,
      clientHeight: canvas.clientHeight,
      rect: { width: rect.width, height: rect.height },
      display: style.display,
      visibility: style.visibility,
      opacity: style.opacity,
      position: style.position
    };
  });
  
  console.log('\n=== Canvas Info ===');
  console.log(JSON.stringify(canvasInfo, null, 2));
  
  // Check if products were loaded
  const appState = await page.evaluate(() => {
    return {
      hasReact: typeof window !== 'undefined',
      // @ts-ignore
      reactRoot: !!window.__REACT_DEVTOOLS_GLOBAL_HOOK__
    };
  });
  
  console.log('\n=== App State ===');
  console.log(JSON.stringify(appState, null, 2));
  
  // Take screenshot
  await page.screenshot({ path: 'debug-screenshot.png', fullPage: true });
  console.log('\n📸 Screenshot saved to debug-screenshot.png');
});

