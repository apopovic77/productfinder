import { expect, test, type Page } from '@playwright/test';

type FirstPaintMeasurement = {
  requestedMs: number;
  readyMs: number;
  detail: { productId: string; priority: number } | null;
  thumbnailRequestsBeforeReady: number;
  catalogRequests: number;
  foregroundStats: any;
  backgroundStats: any;
  lodStats: any;
};

const APP_URL = process.env.PRODUCTFINDER_E2E_URL
  ?? 'http://localhost:5173/productfinder/';
const APP_ORIGIN = new URL(APP_URL).origin;

async function measureFirstVisibleImage(page: Page): Promise<FirstPaintMeasurement> {
  page.on('pageerror', error => console.error('pageerror', error.message));
  page.on('console', message => {
    if (message.type() === 'error') console.error('browser-console', message.text());
  });
  page.on('response', response => {
    if (response.status() >= 400) console.error('http-error', response.status(), response.url());
  });

  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('canvas')).toBeVisible({ timeout: 30_000 });
  await page.waitForFunction(() =>
    performance.getEntriesByName('productfinder-visible-first-image-ready').length > 0,
  );
  const result = await page.evaluate(() => {
    const requested = performance.getEntriesByName('productfinder-visible-image-requested')[0] as PerformanceMark;
    const ready = performance.getEntriesByName('productfinder-visible-first-image-ready')[0] as PerformanceMark;
    return {
      requestedMs: requested.startTime,
      readyMs: ready.startTime,
      detail: (ready.detail ?? null) as { productId: string; priority: number } | null,
      thumbnailRequestsBeforeReady: performance.getEntriesByType('resource').filter(entry =>
        entry.name.includes('/storage/media/')
          && entry.name.includes('width=180')
          && entry.startTime <= ready.startTime,
      ).length,
      catalogRequests: performance.getEntriesByType('resource').filter(entry =>
        entry.name.includes('/oneal-api/v1/products?')
          && entry.name.includes('limit=10000'),
      ).length,
      foregroundStats: (window as any).__imageQueue.getStats(),
      backgroundStats: (window as any).__backgroundImageQueue.getStats(),
      lodStats: (window as any).__lodImageQueue.getStats(),
    };
  });

  return result;
}

test('visible thumbnails own the foreground queue on cold and warm start', async ({ page, context }) => {
  const cdp = await context.newCDPSession(page);
  await cdp.send('Storage.clearDataForOrigin', {
    origin: APP_ORIGIN,
    storageTypes: 'indexeddb,cache_storage',
  });

  const cold = await measureFirstVisibleImage(page);
  expect(cold.detail?.priority).toBeGreaterThanOrEqual(10);
  expect(cold.detail?.priority).toBeLessThanOrEqual(49);
  expect(cold.foregroundStats.activePriorities.every((priority: number) => priority <= 49)).toBe(true);
  expect(cold.foregroundStats.activeByGroup['background-prewarm']).toBeUndefined();
  expect(cold.catalogRequests).toBe(1);
  expect(cold.backgroundStats.maxConcurrent).toBe(2);
  expect(cold.lodStats.maxConcurrent).toBe(2);

  // Allow the first thumbnail's asynchronous IndexedDB write to settle.
  await page.waitForTimeout(500);
  const warm = await measureFirstVisibleImage(page);
  expect(warm.detail?.priority).toBeGreaterThanOrEqual(10);
  expect(warm.detail?.priority).toBeLessThanOrEqual(49);
  expect(warm.catalogRequests).toBe(1);
  expect(warm.thumbnailRequestsBeforeReady).toBeLessThan(cold.thumbnailRequestsBeforeReady);
  expect(warm.readyMs).toBeLessThanOrEqual(cold.readyMs + 250);

  console.log('visible-first metrics', { cold, warm });
});
