import { test, expect } from '@playwright/test';

test.describe('ProductFinder E2E Tests', () => {
  test('should load the page successfully', async ({ page }) => {
    await page.goto('/');
    
    // Check if page title exists
    await expect(page).toHaveTitle(/ProductFinder/i);
    
    // Check if canvas exists
    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible();
    
    console.log('✅ Page loaded successfully');
  });

  test('should fetch and display products', async ({ page }) => {
    await page.goto('/');
    
    // Wait for canvas to be visible
    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible();
    
    // Wait a bit for products to load and render
    await page.waitForTimeout(2000);
    
    // Check if canvas has content (width and height > 0)
    const canvasSize = await canvas.evaluate((el: HTMLCanvasElement) => ({
      width: el.width,
      height: el.height
    }));
    
    expect(canvasSize.width).toBeGreaterThan(0);
    expect(canvasSize.height).toBeGreaterThan(0);
    
    console.log('✅ Canvas rendered with size:', canvasSize);
  });

  test('should use Oneal SDK for API calls', async ({ page }) => {
    // Intercept API calls
    const apiCalls: string[] = [];
    
    page.on('request', request => {
      const url = request.url();
      if (url.includes('oneal-api.arkturian.com')) {
        apiCalls.push(url);
        console.log('📡 API Call:', url);
      }
    });
    
    await page.goto('/');
    
    // Wait for API calls
    await page.waitForTimeout(2000);
    
    // Check if API was called
    expect(apiCalls.length).toBeGreaterThan(0);
    expect(apiCalls.some(url => url.includes('/products'))).toBeTruthy();
    
    console.log('✅ Oneal API called successfully');
    console.log(`   Total API calls: ${apiCalls.length}`);
  });

  test('should verify API response structure', async ({ page }) => {
    let productData: any = null;
    
    // Intercept API response
    page.on('response', async response => {
      const url = response.url();
      if (url.includes('oneal-api.arkturian.com') && url.includes('/products')) {
        try {
          productData = await response.json();
          console.log('📦 Product data received:', {
            hasResults: !!productData.results,
            count: productData.results?.length || 0
          });
        } catch (e) {
          console.error('Failed to parse response:', e);
        }
      }
    });
    
    await page.goto('/');
    await page.waitForTimeout(2000);
    
    // Verify product data structure
    expect(productData).not.toBeNull();
    expect(productData.results).toBeDefined();
    expect(Array.isArray(productData.results)).toBeTruthy();
    expect(productData.results.length).toBeGreaterThan(0);
    
    // Check first product structure
    const firstProduct = productData.results[0];
    expect(firstProduct).toHaveProperty('id');
    expect(firstProduct).toHaveProperty('name');
    expect(firstProduct).toHaveProperty('category');
    
    console.log('✅ Product structure valid');
    console.log('   Sample product:', {
      id: firstProduct.id,
      name: firstProduct.name,
      category: firstProduct.category
    });
  });

  test('should handle canvas interactions', async ({ page }) => {
    await page.goto('/');
    
    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible();
    
    // Wait for products to load
    await page.waitForTimeout(2000);
    
    // Get canvas bounding box
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    
    if (box) {
      // Click in the center of canvas
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      console.log('✅ Canvas interaction successful');
    }
  });

  test('should verify SDK integration', async ({ page }) => {
    // Check console for any SDK errors
    const consoleMessages: string[] = [];
    const errors: string[] = [];
    
    page.on('console', msg => {
      consoleMessages.push(msg.text());
    });
    
    page.on('pageerror', error => {
      errors.push(error.message);
      console.error('❌ Page error:', error.message);
    });
    
    await page.goto('/');
    await page.waitForTimeout(2000);
    
    // Check for SDK-related errors
    const sdkErrors = errors.filter(e => 
      e.includes('arkturian-oneal-sdk') || 
      e.includes('SDK') ||
      e.includes('Configuration')
    );
    
    expect(sdkErrors.length).toBe(0);
    console.log('✅ No SDK errors detected');
    
    if (errors.length > 0) {
      console.log('⚠️  Other errors found:', errors);
    }
  });
});

