# Hero Mode Development Plan

## Overview
Hero Mode is a special display mode that activates when a pivot bucket contains fewer than 8 products. It provides an enhanced, catalog-style view for browsing product variants.

## Current Behavior
- **Trigger**: Automatically activates when pivot bucket has < 8 products
- **Display**: Products are shown larger (80% viewport height) with horizontal scrolling
- **Layout**: HeroLayouter arranges products horizontally with spacing
- **Camera**: Stays at scale 1.0 (no zoom)

## Target Behavior

### Stage 1: Initial Hero Mode Display
**What to show:**
- Products displayed large (already implemented)
- Each product shows ONE image (main variant)
- Canvas text rendering for each product:
  - **Top-left**: Product name (e.g., "BACKFLIP HELMET")
  - **Center below image**: Variant color name (e.g., "BLACK/WHITE")

### Stage 2: Click Interaction - Variant Expansion
**When user clicks a product in Hero Mode:**

**Case A: Product has only 1 variant**
- → Open V4 Modal directly (show all perspectives of that variant)

**Case B: Product has multiple variants (2+)**
- → Expand to show all color variants
- Animation similar to pivot mode perspective expansion
- Variants appear overlapping with smooth animation
- Each variant tile shows:
  - Same product from same perspective
  - Different color/pattern
  - Variant color name below

**Case C: Click on expanded variant**
- → Open V4 Modal for that specific variant

## Technical Requirements

### 1. Data Structure Analysis
**Need to determine:**
- ✅ Product has `variants` array (ProductVariant[])
- ✅ Each variant has: `name`, `sku`, `option1`, `option2`, `image_storage_id`
- ❓ How to identify color from variant data (option1/option2?)
- ❓ Which image is "main perspective" for each variant
- ❓ Do we have perspective/role metadata for images?

### 2. Canvas Text Rendering
**Implementation:**
- Render text directly in Canvas (NOT HTML overlays)
- Text transforms automatically with viewport zoom/pan
- No special handling needed for viewport transformations
- Use Canvas `fillText()` with proper font styling

**Text positioning:**
- Product name: Top-left of product tile (offset: -40px Y)
- Variant name: Center-bottom of product tile (offset: +20px Y)
- Text should be readable but not too large
- Consider text shadows for readability

### 3. Variant Expansion System
**Similar to existing perspective expansion in Pivot Mode:**
- Load variant images when product is clicked
- Create additional LayoutNodes for each variant
- Animate variants appearing with overlapping layout
- Maintain smooth interpolation for all transforms

**Differences from perspective expansion:**
- Perspectives: Multiple angles of SAME variant
- Variants: Different colors of SAME product (same angle)

### 4. State Management
**New states to track:**
- `expandedProductId`: Which product has variants expanded (null if none)
- `variantNodes`: Map of product ID to expanded variant nodes
- Variant expansion should override normal hero mode layout

### 5. Image Loading Strategy
**For each variant:**
- Use `variant.image_storage_id` if available
- Fallback to finding images by matching variant color/name
- Priority: Main perspective image (front view preferred)
- Load all variant images when expansion triggered

## Implementation Steps

### Phase 1: Data Structure Analysis
1. Examine real product data from O'Neal API
2. Understand variant structure (option1/option2 mapping)
3. Determine how to extract color names
4. Check if perspective metadata exists
5. Validate image_storage_id availability

### Phase 2: Canvas Text Rendering
1. Add text rendering to ProductRenderer
2. Create text style configuration (font, size, color)
3. Implement text positioning relative to product tiles
4. Add text rendering only in Hero Mode
5. Test text transforms with viewport zoom/pan

### Phase 3: Variant Detection
1. Add helper function to extract color from variant
2. Group variants by color (handle duplicates)
3. Select main image per variant (prefer front perspective)
4. Create variant metadata structure

### Phase 4: Variant Expansion System
1. Detect click on hero mode product
2. Check variant count (1 vs 2+)
3. If 1 variant: Open V4 Modal
4. If 2+ variants: Create expansion nodes
5. Animate variant tiles appearing with overlap
6. Handle click on expanded variant → V4 Modal

### Phase 5: Layout & Animation
1. Create overlapping layout strategy for variants
2. Implement smooth animation for variant appearance
3. Ensure proper z-ordering for overlapped tiles
4. Add hover effects for variant selection
5. Test with various viewport sizes

### Phase 6: Integration & Testing
1. Test with real O'Neal product data
2. Verify all variants are correctly identified
3. Test animation smoothness
4. Verify V4 Modal opens with correct variant
5. Test edge cases (no variants, many variants, etc.)

## ✅ DATA STRUCTURE ANALYSIS COMPLETE

### Critical Findings:

1. **✅ Image perspective identification - SOLVED**:
   - MediaItems HAVE a `role` field: `'hero'` | `'gallery'` | `'thumbnail'`
   - `'hero'` = Main/front view image
   - `'gallery'` = Additional perspectives
   - Images are sorted with hero first
   - Filename contains perspective: e.g., `_gray_front.png`, `_gray_side.png`

2. **✅ Variant color extraction - SOLVED**:
   - Color is in variant.name: `"Black/White / L"` → color = `"Black/White"`, size = `"L"`
   - Format: `"Color / Size"` or `"Color1/Color2 / Size"`
   - Helper exists: `getVariantColor(variant)` extracts color correctly
   - System already parses this in ProductRepository (lines 380-388)

3. **✅ Image associations - SOLVED**:
   - YES! Each variant has `image_storage_id` (main image for that color)
   - Multiple images per variant matched by filename pattern
   - Images matched by color in filename: `_${color}_front.png`
   - Helper exists: `getImagesForVariant(product, variant)` returns all images for a variant

### Existing Helper Functions (variantImageHelpers.ts):

```typescript
// Get all images (hero + gallery) for a specific variant
getImagesForVariant(product, variant): Array<{storageId, role, src}>

// Get the primary/hero variant for a product
getPrimaryVariant(product): Variant | null

// Extract color from variant name
getVariantColor(variant): string  // "Black/White / L" → "Black/White"

// Get unique color variants (one per color, no duplicates)
getUniqueColorVariants(product): Variant[]
```

### Image Matching Strategy:
1. Variant has `image_storage_id` → That's the main image
2. Find all images in product.media where filename contains `_${color}_`
3. Sort by role: `hero` first, then `gallery`
4. First image with role='hero' = Main perspective for that variant

### Secondary Questions:
1. Should we cache variant expansions?
2. How to handle products with 10+ variants?
3. Should overlapping be configurable?
4. What's the max overlap distance?

## API Reference

### Existing Types
```typescript
type ProductVariant = {
  name: string;
  sku?: string;
  gtin13?: string;
  price?: number;
  currency?: string;
  availability?: string;
  url?: string;
  image_storage_id?: number;  // Main variant image
  option1?: string;            // Size or Color?
  option2?: string;            // Color or Size?
};

type MediaItem = {
  src: string;
  alt?: string;
  type?: string;
  role?: 'hero' | 'gallery' | 'thumbnail';  // Perspective info?
  storage_id?: number;
};
```

### New Helpers Needed
```typescript
// Extract color name from variant
function getVariantColor(variant: ProductVariant): string

// Get all unique colors for a product
function getProductColors(product: Product): string[]

// Get main image for a variant
function getVariantMainImage(product: Product, variant: ProductVariant): MediaItem

// Check if product has multiple color variants
function hasMultipleVariants(product: Product): boolean
```

## Success Criteria

### Minimum Viable Product (MVP):
- ✅ Text rendering works (product name + variant color)
- ✅ Click detection works in hero mode
- ✅ Variant expansion animates smoothly
- ✅ V4 Modal opens for selected variant
- ✅ Works with real O'Neal data

### Nice to Have:
- 🎯 Smooth hover effects on variants
- 🎯 Keyboard navigation between variants
- 🎯 Variant color preview dots
- 🎯 Smooth collapse animation
- 🎯 Loading states for variant images

## Timeline Estimate

- **Phase 1** (Data Analysis): 30 minutes
- **Phase 2** (Text Rendering): 1 hour
- **Phase 3** (Variant Detection): 1 hour
- **Phase 4** (Expansion System): 2 hours
- **Phase 5** (Layout & Animation): 1.5 hours
- **Phase 6** (Testing): 1 hour

**Total Estimated Time**: ~7 hours

## Notes
- This feature is inspired by O'Neal catalog design
- Text must be canvas-rendered for proper viewport integration
- Animation should feel similar to existing perspective expansion
- Edge cases matter: 1 variant, 10+ variants, missing images
