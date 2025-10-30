# LOD (Level of Detail) System

## Overview

The LOD (Level of Detail) system dynamically adjusts image quality based on how large products appear on screen. This optimizes bandwidth and rendering performance while maintaining visual quality where it matters most.

## Core Concepts

### Screen Space vs World Space

- **World Space**: The layout coordinates where products are positioned (e.g., `x: 100, y: 200, width: 80, height: 120`)
- **Screen Space**: The actual pixel size after applying viewport zoom/scale
- **Formula**: `screenSize = worldSize * viewport.scale`

### Resolution Tiers

The system uses two image quality tiers:

| Tier | Resolution | Quality | Use Case |
|------|-----------|---------|----------|
| **Low** | 150px | 75% | Zoomed out, small on screen |
| **High** | 1300px | 85% | Zoomed in, large on screen |

**Transition Point**: When a product exceeds 500px in screen space, the system switches to high-resolution.

### Priority-Based Loading

Images are loaded in order of importance:
1. **Center viewport items** load first (priority = distance from viewport center)
2. **Visible items only** are queued
3. **Rate limited** to prevent blocking (1 image per 100ms by default)

## Architecture

### Component Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    CanvasRenderer (60 FPS)                   │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Render Loop (requestAnimationFrame)                   │ │
│  │  - Draws products at current image quality             │ │
│  │  - Triggers queue processing every 100ms               │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│              LOD Scan Loop (1 FPS / 1000ms)                  │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  updateImageLOD()                                      │ │
│  │  1. Calculate visible viewport bounds                  │ │
│  │  2. For each visible node:                             │ │
│  │     - Calculate screen size                            │ │
│  │     - Determine required resolution (low/high)         │ │
│  │     - Check if different from current                  │ │
│  │     - Add to queue with priority                       │ │
│  │  3. Sort queue by priority (center → edges)            │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│          Queue Processor (10 FPS / 100ms)                    │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  processQueue()                                        │ │
│  │  1. Re-check visibility (viewport may have moved)      │ │
│  │  2. Re-check required size (zoom may have changed)     │ │
│  │  3. Skip if already loaded                             │ │
│  │  4. Load up to N images this cycle (default: 1)        │ │
│  │  5. Mark as loaded to prevent re-queuing               │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                    Image Loading (Async)                     │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  loadImageForNode()                                    │ │
│  │  1. Build URL: storage.media_url + size + quality      │ │
│  │  2. Call product.loadImageFromUrl() (async)            │ │
│  │  3. Product updates its internal _image on success     │ │
│  │  4. On error: keeps existing image (graceful fallback) │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Execution Timeline

```
Time: 0ms ──────► 100ms ────► 1000ms ───► 1100ms ───► 2000ms ───►
      │           │            │           │            │
RAF:  Render      Process      Render      Process      Scan
      Draw        Queue        Draw        Queue        + Sort
      Products    (load 1)     Products    (load 1)     Queue
```

## Implementation Details

### 1. Configuration (`src/config/LODConfig.ts:5-26`)

All LOD behavior is controlled through `LOD_CONFIG`:

```typescript
export const LOD_CONFIG = {
  enabled: true,              // Master switch for LOD system

  scanInterval: 1000,         // Scan for needed images (1 FPS)
  processInterval: 100,       // Process load queue (10 FPS)

  lowResolution: 150,         // Low-res image width (px)
  highResolution: 1300,       // High-res image width (px)

  transitionThreshold: 500,   // Switch to high-res at this screen size

  maxLoadsPerCycle: 1,        // Images per process cycle

  lowQuality: 75,             // JPEG/WebP quality for low-res
  highQuality: 85,            // JPEG/WebP quality for high-res
};
```

### 2. Scan Phase (`src/render/CanvasRenderer.ts:79-159`)

**Frequency**: 1 FPS (every 1000ms)
**Execution**: Separate `setInterval` loop
**Purpose**: Identify which images need to be loaded or upgraded

**Algorithm**:

```typescript
private updateImageLOD() {
  // 1. Calculate visible viewport bounds (AABB)
  const viewportLeft = -this.viewport.offset.x / scale;
  const viewportTop = -this.viewport.offset.y / scale;
  const viewportRight = viewportLeft + (canvas.width / scale);
  const viewportBottom = viewportTop + (canvas.height / scale);

  for (const node of nodes) {
    // 2. Visibility check (AABB collision detection)
    const isVisible = !(
      x + w < viewportLeft ||   // completely left
      x > viewportRight ||       // completely right
      y + h < viewportTop ||     // completely above
      y > viewportBottom         // completely below
    );

    if (!isVisible) continue;

    // 3. Calculate screen space size
    const screenWidth = w * scale;
    const screenHeight = h * scale;
    const screenSize = Math.max(screenWidth, screenHeight);

    // 4. Determine required resolution
    const requiredSize = screenSize > LOD_CONFIG.transitionThreshold
      ? LOD_CONFIG.highResolution
      : LOD_CONFIG.lowResolution;

    // 5. Check if we need to load a different size
    const currentSize = this.loadedImageSizes.get(node.id);
    if (currentSize !== requiredSize) {
      // 6. Calculate priority (distance from viewport center)
      const centerX = (viewportLeft + viewportRight) / 2;
      const centerY = (viewportTop + viewportBottom) / 2;
      const nodeCenterX = x + w / 2;
      const nodeCenterY = y + h / 2;
      const distanceFromCenter = Math.sqrt(
        Math.pow(nodeCenterX - centerX, 2) +
        Math.pow(nodeCenterY - centerY, 2)
      );

      // 7. Add to queue if not already queued
      if (!alreadyQueued) {
        this.loadQueue.push({
          nodeId: node.id,
          storageId,
          size: requiredSize,
          priority: distanceFromCenter  // Lower = higher priority
        });
      }
    }
  }

  // 8. Sort queue by priority (center items first)
  this.loadQueue.sort((a, b) => a.priority - b.priority);
}
```

### 3. Process Phase (`src/render/CanvasRenderer.ts:168-238`)

**Frequency**: 10 FPS (every 100ms)
**Execution**: Integrated into `requestAnimationFrame` loop with time-based rate limiting
**Purpose**: Validate and execute pending image loads

**Algorithm**:

```typescript
private processQueue() {
  if (!this.viewport || this.loadQueue.length === 0) return;

  // Re-calculate current viewport bounds
  const viewportLeft = -this.viewport.offset.x / scale;
  const viewportTop = -this.viewport.offset.y / scale;
  const viewportRight = viewportLeft + (canvas.width / scale);
  const viewportBottom = viewportTop + (canvas.height / scale);

  let loadedThisCycle = 0;

  // Process from front (highest priority) to back
  while (this.loadQueue.length > 0 &&
         loadedThisCycle < LOD_CONFIG.maxLoadsPerCycle) {
    const task = this.loadQueue.shift()!;

    // 1. Find the node
    const node = nodes.find(n => n.id === task.nodeId);
    if (!node) continue; // Node removed, skip

    // 2. Re-check visibility (viewport may have panned)
    const isVisible = !(
      x + w < viewportLeft ||
      x > viewportRight ||
      y + h < viewportTop ||
      y > viewportBottom
    );

    if (!isVisible) continue; // No longer visible, skip

    // 3. Re-check required size (zoom may have changed)
    const screenSize = Math.max(w * scale, h * scale);
    const requiredSize = screenSize > LOD_CONFIG.transitionThreshold
      ? LOD_CONFIG.highResolution
      : LOD_CONFIG.lowResolution;

    if (requiredSize !== task.size) continue; // Size changed, skip

    // 4. Check if already loaded
    const currentSize = this.loadedImageSizes.get(task.nodeId);
    if (currentSize === requiredSize) continue; // Already loaded

    // 5. Load the image (async, fire-and-forget)
    this.loadImageForNode(node, task.size);

    // 6. Mark as loaded (prevents immediate re-queue)
    this.loadedImageSizes.set(task.nodeId, task.size);

    loadedThisCycle++;
  }
}
```

**Why Re-Validate?**

Between scan and process (up to 1 second delay), the user might:
- Pan/zoom the viewport → different items visible
- Zoom in/out → different resolution needed
- Navigate away → items no longer exist

Re-validation prevents wasting bandwidth on stale requests.

### 4. Loading Phase (`src/render/CanvasRenderer.ts:244-261`)

**Execution**: Async (non-blocking)
**Purpose**: Trigger image download and update Product

```typescript
private loadImageForNode(node: LayoutNode<T>, size: number) {
  const product = node.data as any;

  // Verify product supports image loading
  if (!product.primaryImage?.storage_id ||
      typeof product.loadImageFromUrl !== 'function') {
    return;
  }

  const storageId = product.primaryImage.storage_id;
  const quality = size === LOD_CONFIG.highResolution
    ? LOD_CONFIG.highQuality
    : LOD_CONFIG.lowQuality;

  // Build optimized image URL
  const imageUrl = `https://api-storage.arkturian.com/storage/media/${storageId}?width=${size}&format=webp&quality=${quality}`;

  // Trigger async load (Product handles caching and error recovery)
  product.loadImageFromUrl(imageUrl);
}
```

### 5. Product Image Management (`src/types/Product.ts:191-245`)

The `Product` class manages its own image state using OOP principles:

```typescript
class Product {
  private static imageCache = new Map<string, HTMLImageElement>();
  private static loadingPromises = new Map<string, Promise<HTMLImageElement>>();

  private _image: HTMLImageElement | null = null;
  private _imageLoading = false;
  private _imageError = false;

  async loadImageFromUrl(url: string): Promise<HTMLImageElement | null> {
    // 1. Return cached image if available
    if (Product.imageCache.has(url)) {
      const cachedImg = Product.imageCache.get(url)!;
      if (!this._image || this._image.src !== cachedImg.src) {
        this._image = cachedImg; // Upgrade to cached version
      }
      return this._image;
    }

    // 2. Deduplicate concurrent requests
    if (Product.loadingPromises.has(url)) {
      return Product.loadingPromises.get(url)!;
    }

    // 3. Create new image load promise
    const loadPromise = new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();

      img.onload = () => {
        this._image = img; // SUCCESS: Update to new image
        this._imageLoading = false;
        Product.imageCache.set(url, img);
        Product.loadingPromises.delete(url);
        resolve(img);
      };

      img.onerror = () => {
        this._imageLoading = false;
        this._imageError = true;
        Product.loadingPromises.delete(url);

        // IMPORTANT: Keep existing image on error!
        // this._image stays unchanged (graceful degradation)

        reject(new Error(`Image load failed: ${url}`));
      };

      img.src = url; // Trigger browser download
    });

    Product.loadingPromises.set(url, loadPromise);

    try {
      return await loadPromise;
    } catch {
      // On error, return current image (may be lower res, better than nothing)
      return this._image;
    }
  }
}
```

**Key Features**:
- **Global Cache**: Prevents duplicate downloads across products
- **Promise Deduplication**: Multiple calls for same URL share one download
- **Graceful Fallback**: On error, keeps existing (lower quality) image instead of showing placeholder
- **Self-Contained**: Product manages its own state, renderer just triggers load

### 6. Render Integration (`src/render/CanvasRenderer.ts:42-56`)

The render loop integrates all phases:

```typescript
start() {
  this.stop();

  // Main render loop (60 FPS) with integrated queue processing
  const loop = (timestamp: number) => {
    this.draw(); // Render current state

    // Process queue in RAF loop (non-blocking, time-based rate limiting)
    if (LOD_CONFIG.enabled) {
      const timeSinceLastProcess = timestamp - this.lastQueueProcessTime;
      if (timeSinceLastProcess >= LOD_CONFIG.processInterval) {
        this.processQueue(); // Process up to N images
        this.lastQueueProcessTime = timestamp;
      }
    }

    this.rafId = requestAnimationFrame(loop);
  };
  this.rafId = requestAnimationFrame(loop);

  // LOD scan loop - only start if enabled
  if (LOD_CONFIG.enabled) {
    this.lodUpdateInterval = window.setInterval(() => {
      this.updateImageLOD(); // Scan and queue
    }, LOD_CONFIG.scanInterval);
  }
}
```

**Performance Characteristics**:
- **Non-Blocking**: Queue processing is time-sliced (1 image per 100ms)
- **Frame-Aligned**: Processing happens in sync with rendering
- **Adaptive**: Browser pauses RAF when tab is inactive (saves CPU)
- **Configurable**: All frequencies and limits controlled via `LOD_CONFIG`

## Example Scenario

### User zooms in on a product:

```
Time: 0ms
├─ Product on screen: 150px
├─ Current image: 150px low-res
└─ LOD State: ✓ Correct resolution

User zooms in (scale: 1.0 → 3.0)

Time: 16ms (next frame)
├─ Product on screen: 450px
├─ Current image: 150px low-res
└─ LOD State: ⚠️  Image too small (still acceptable)

Time: 1000ms (next LOD scan)
├─ Scan detects: screenSize=450px < threshold=500px
└─ No action (still within low-res range)

User zooms more (scale: 3.0 → 4.0)

Time: 2000ms (next LOD scan)
├─ Scan detects: screenSize=600px > threshold=500px
├─ Required: 1300px high-res
├─ Current: 150px low-res
├─ Priority: 25.5 (center of viewport)
└─ Action: Add to queue

Time: 2100ms (next queue process)
├─ Re-check visibility: ✓ Still visible
├─ Re-check size: screenSize=600px → still needs high-res
├─ Load: https://api-storage.arkturian.com/storage/media/1234?width=1300&format=webp&quality=85
└─ Mark as loading (prevents re-queue)

Time: 2400ms (image loaded)
├─ Product._image updated to 1300px version
└─ Next render shows high-res image

Time: 2416ms (next frame)
├─ Renderer draws product with new high-res image
└─ User sees crisp, detailed image
```

## Performance Optimization

### Rate Limiting

**Problem**: Loading too many images at once blocks the main thread
**Solution**: Limit to 1 image per 100ms (configurable via `LOD_CONFIG.maxLoadsPerCycle`)

**Math**:
- 1 image per 100ms = 10 images/second
- At 60 FPS, each frame has ~16ms budget
- Image decode typically takes 5-10ms
- Loading 1 per 100ms = 0.1 images per frame = minimal impact

### Visibility Culling

**Problem**: Scanning thousands of off-screen nodes wastes CPU
**Solution**: AABB (Axis-Aligned Bounding Box) collision detection

**Algorithm**:
```typescript
// Fast rejection test - only 4 comparisons
const isVisible = !(
  x + w < viewportLeft ||   // completely left
  x > viewportRight ||       // completely right
  y + h < viewportTop ||     // completely above
  y > viewportBottom         // completely below
);
```

**Complexity**: O(n) where n = total nodes, but with early exit

### Priority-Based Queue

**Problem**: Loading edges before center degrades perceived performance
**Solution**: Sort by distance from viewport center (Euclidean distance)

**Benefits**:
- Center items (most likely to be viewed) load first
- Edge items (less important) load later
- User perceives faster loading

### Graceful Degradation

**Problem**: Network errors or slow connections break the experience
**Solution**: Multi-layer fallback strategy

1. **On initial load**: Show placeholder with dashed border
2. **On low-res load**: Show 150px image (fast, small file)
3. **On high-res load**: Upgrade to 1300px image (slower, large file)
4. **On error**: Keep previous image instead of breaking

**User Experience**: Never shows broken images, always has something to display

## Configuration Guide

### Tuning for Different Use Cases

#### High-End Desktop (Fast Network)
```typescript
export const LOD_CONFIG = {
  enabled: true,
  scanInterval: 500,          // Scan more frequently
  processInterval: 50,        // Process faster
  lowResolution: 300,         // Higher low-res
  highResolution: 2000,       // Higher high-res
  transitionThreshold: 400,   // Upgrade sooner
  maxLoadsPerCycle: 3,        // Load more per cycle
  lowQuality: 80,
  highQuality: 90,
};
```

#### Mobile (Slow Network, Limited Memory)
```typescript
export const LOD_CONFIG = {
  enabled: true,
  scanInterval: 2000,         // Scan less frequently
  processInterval: 200,       // Process slower
  lowResolution: 100,         // Lower low-res
  highResolution: 800,        // Lower high-res
  transitionThreshold: 600,   // Stay low-res longer
  maxLoadsPerCycle: 1,        // Conservative loading
  lowQuality: 70,
  highQuality: 80,
};
```

#### Debug / Testing (Disable LOD)
```typescript
export const LOD_CONFIG = {
  enabled: false,  // Master switch off
  // ... rest of config ignored
};
```

## Debugging

### Enable Console Logging

Add logging to track LOD behavior:

```typescript
private updateImageLOD() {
  console.log(`[LOD Scan] Checking ${nodes.length} nodes`);

  // ... existing code ...

  if (queuedCount > 0) {
    console.log(`[LOD Scan] Queued ${queuedCount} images, total queue: ${this.loadQueue.length}`);
  }
}

private processQueue() {
  const queueLength = this.loadQueue.length;
  console.log(`[LOD Process] Queue size: ${queueLength}`);

  // ... existing code ...

  console.log(`[LOD Process] Loaded ${loadedThisCycle} images this cycle`);
}
```

### Visual Debug Overlay

Add visual indicators to see LOD state:

```typescript
private draw() {
  // ... existing render code ...

  // Debug: Show resolution tier
  if (DEBUG_LOD) {
    const screenSize = Math.max(w * scale, h * scale);
    const currentSize = this.loadedImageSizes.get(node.id);

    this.ctx.fillStyle = currentSize === LOD_CONFIG.highResolution
      ? 'rgba(0, 255, 0, 0.3)'   // Green = high-res
      : 'rgba(255, 0, 0, 0.3)';  // Red = low-res

    this.ctx.fillRect(x, y, 20, 20); // Corner indicator

    this.ctx.fillStyle = 'white';
    this.ctx.font = '10px monospace';
    this.ctx.fillText(`${currentSize}px`, x + 2, y + 12);
  }
}
```

### Performance Monitoring

Track LOD performance metrics:

```typescript
class LODMetrics {
  totalScans = 0;
  totalQueuedTasks = 0;
  totalLoadedImages = 0;
  totalSkippedTasks = 0;
  avgScanTime = 0;
  avgProcessTime = 0;

  recordScan(duration: number, queuedCount: number) {
    this.totalScans++;
    this.totalQueuedTasks += queuedCount;
    this.avgScanTime = (this.avgScanTime * (this.totalScans - 1) + duration) / this.totalScans;
  }

  recordProcess(duration: number, loadedCount: number, skippedCount: number) {
    this.totalLoadedImages += loadedCount;
    this.totalSkippedTasks += skippedCount;
    this.avgProcessTime = (this.avgProcessTime * (this.totalScans - 1) + duration) / this.totalScans;
  }

  report() {
    console.table({
      'Total Scans': this.totalScans,
      'Total Queued': this.totalQueuedTasks,
      'Total Loaded': this.totalLoadedImages,
      'Total Skipped': this.totalSkippedTasks,
      'Avg Scan Time (ms)': this.avgScanTime.toFixed(2),
      'Avg Process Time (ms)': this.avgProcessTime.toFixed(2),
      'Queue Efficiency (%)': ((this.totalLoadedImages / this.totalQueuedTasks) * 100).toFixed(1),
    });
  }
}
```

## Future Enhancements

### 1. Progressive Loading
Load images in multiple passes (thumbnail → low → medium → high)

### 2. Predictive Loading
Preload images in the direction of viewport movement

### 3. Adaptive Quality
Adjust quality based on network speed (use Network Information API)

### 4. WebP + AVIF
Support modern formats with fallback to JPEG

### 5. Intersection Observer
Use native browser API for visibility detection (more efficient than manual AABB)

### 6. Worker-Based Processing
Offload queue processing to Web Worker (truly non-blocking)

## Summary

The LOD system provides:
- **Automatic optimization**: Right quality for each zoom level
- **Non-blocking execution**: Doesn't interfere with 60 FPS rendering
- **Priority-based loading**: Center items load first
- **Graceful degradation**: Always shows something, never breaks
- **Fully configurable**: Easy to tune for different environments
- **OOP design**: Self-contained Product image management

**Key Files**:
- `src/config/LODConfig.ts` - Configuration
- `src/render/CanvasRenderer.ts` - LOD logic (scan, process, load)
- `src/types/Product.ts` - Image management (cache, load, state)
