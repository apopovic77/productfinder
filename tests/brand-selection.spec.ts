import { expect, test } from '@playwright/test';

const APP_URL = process.env.PRODUCTFINDER_E2E_URL ?? 'http://localhost:5173/productfinder/';

test('multi-brand entry selects exact brand and exposes mobile-safe breadcrumb', async ({ page }) => {
  let catalogRequestUrl = '';

  await page.route('**/oneal-api/v1/facets', async route => {
    const response = await route.fetch();
    const payload = await response.json();
    await route.fulfill({
      response,
      json: {
        ...payload,
        brands: [
          { name: "O'Neal", count: 6415, count_with_image: 579 },
          { name: 'KINI Red Bull', count: 43, count_with_image: 43 },
        ],
      },
    });
  });
  await page.route('**/oneal-api/v1/products?**', async route => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('limit') === '10000') catalogRequestUrl = url.toString();
    await route.continue();
  });

  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Catalog 2027' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'français' })).toBeDisabled();
  await page.getByRole('button', { name: 'English' }).click();
  await expect(page.getByRole('heading', { name: 'Choose your brand' })).toBeVisible();
  await expect(page.getByText('579 products')).toBeVisible();
  expect(catalogRequestUrl).toBe('');

  await page.getByRole('button', { name: /O'Neal 579 products/ }).click();
  await expect(page.getByRole('heading', { name: 'Choose your sport' })).toBeVisible();
  await expect(page.getByRole('button', { name: /MTB/ })).toBeDisabled();
  await page.getByRole('button', { name: 'MOTO' }).click();
  await expect(page.getByRole('heading', { name: 'Choose your product category' })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: /MX HELMETS/ }).click();
  await expect(page.locator('canvas')).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => catalogRequestUrl).toContain('brand=O%27Neal');
  expect(new URL(catalogRequestUrl).searchParams.get('has_image')).toBe('true');
  await expect(page.locator('.pf-header .pf-brand-breadcrumb')).toHaveText("O'Neal");
  await expect(page).toHaveURL(/brand=O%27Neal/);
  await expect(page).toHaveURL(/sport=moto/);
  await expect(page).toHaveURL(/category=mx-helmets/);

  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Choose your product category' })).toBeVisible();
  await expect(page).not.toHaveURL(/category=mx-helmets/);
  await page.goForward();
  await expect(page.locator('canvas')).toBeVisible({ timeout: 30_000 });

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileBrandBreadcrumb = page.locator('.pf-mobile-breadcrumb-row .pf-brand-breadcrumb');
  await expect(mobileBrandBreadcrumb).toBeVisible();
  const bounds = await mobileBrandBreadcrumb.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);

  await mobileBrandBreadcrumb.click();
  await expect(page.getByRole('heading', { name: 'Choose your brand' })).toBeVisible();
});

test('stable guided-entry deep link reaches the existing catalog', async ({ page }) => {
  await page.goto(`${APP_URL}?lang=en&brand=O%27Neal&sport=moto&category=mx-helmets`, {
    waitUntil: 'domcontentloaded',
  });
  await expect(page.locator('canvas')).toBeVisible({ timeout: 30_000 });
  await expect(page).toHaveURL(/lang=en/);
  await expect(page).toHaveURL(/sport=moto/);
  await expect(page).toHaveURL(/category=mx-helmets/);
  await expect(page.locator('.pf-header .pf-catalog-breadcrumb')).toContainText([
    'Catalog 2027',
    'MOTO',
    'MX HELMETS',
  ]);
});
