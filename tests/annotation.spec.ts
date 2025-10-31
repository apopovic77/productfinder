import { test, expect } from '@playwright/test';

const OBJECT_ID = process.env.ANNOT_OBJECT_ID ?? '4642';
const API_KEY = process.env.ANNOT_API_KEY ?? 'oneal_demo_token';

test.describe('Annotation Tester', () => {
  test('runs annotation pipeline end-to-end', async ({ page }) => {
    test.skip(!OBJECT_ID, 'Object ID is required for annotation test');

    await page.goto('/annot');

    await page.getByLabel('Storage Object ID').fill(OBJECT_ID);
    await page.getByLabel('API Key').fill(API_KEY);

    await page.getByRole('button', { name: 'Load Image' }).click();
    await page.waitForSelector('img[alt="preview"]', { timeout: 30_000 });

    const metadataSection = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: 'Object Metadata' }) })
      .locator('pre');
    await expect(metadataSection).toContainText(OBJECT_ID, { timeout: 30_000 });

    await page.getByRole('button', { name: 'Start Analysis' }).click();

    const taskSection = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: 'Task Status' }) })
      .locator('pre');
    await expect(taskSection).toContainText(/"status"\s*:\s*"completed"/, { timeout: 120_000 });

    const promptSection = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: 'Prompt' }) })
      .locator('pre');
    await expect(promptSection).not.toHaveText(/^\s*$/, { timeout: 120_000 });

    const responseSection = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: 'AI Response' }) })
      .locator('pre');
    await expect(responseSection).not.toHaveText(/^\s*$/, { timeout: 120_000 });

    const annotationsSection = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: 'Annotations (raw)' }) })
      .locator('pre');
    await expect(annotationsSection).toContainText('[', { timeout: 120_000 });
  });
});

