import { LayoutNode } from '../layout/LayoutNode';
import { ViewportTransform } from '../utils/ViewportTransform';
import type { Product } from '../types/Product';
import type { GroupHeaderInfo } from '../layout/PivotLayouter';
import { LOD_CONFIG } from '../config/LODConfig';
import { ProductOverlayCanvas, DEFAULT_OVERLAY_STYLE } from './ProductOverlayCanvas';
import { ProductOverlayCanvasV2, MODERN_OVERLAY_STYLE } from './ProductOverlayCanvasV2';
import { globalImageQueue } from '../utils/GlobalImageQueue';
import { buildMediaUrl } from '../utils/MediaUrlBuilder';
import { InterpolatedProperty } from 'arkturian-typescript-utils';

type LoadTask = {
  nodeId: string;
  storageId: number;
  size: number;
  priority: number; // Lower = higher priority
};

export class CanvasRenderer<T> {
  private rafId: number | null = null;
  private lodUpdateInterval: number | null = null;
  public hoveredItem: T | null = null;
  public focusedItem: T | null = null;
  public hoveredGroupKey: string | null = null;
  public hoveredGroupLabel: string | null = null; // Full label for tooltip

  // Selected product for overlay rendering
  public selectedProduct: Product | null = null;
  public selectedProductAnchor: { x: number; y: number } | null = null;
  public selectedProductBounds: { x: number; y: number; width: number; height: number } | null = null; // Cell dimensions
  public heroDisplayMode: 'overlay' | 'force-labels' = 'overlay';
  public overlayScaleMode: 'scale-invariant' | 'scale-with-content' = 'scale-invariant';
  public imageSpreadDirection: 'auto' | 'horizontal' | 'vertical' = 'auto';

  // Variant-specific hero image (overrides product's primary image)
  public selectedVariantHeroImage: HTMLImageElement | null = null;

  // Dialog connection line (for React overlay mode)
  public dialogConnectionPoint: { x: number; y: number } | null = null; // Product center in canvas space
  public dialogPosition: { x: number; y: number } | null = null; // Dialog position in screen space
  public alternativeImages: Array<{
    storageId: number;
    src: string;
    loadedImage?: HTMLImageElement;
    orientation?: 'portrait' | 'landscape';
    spreadOffset?: InterpolatedProperty<number>;
  }> | null = null;

  // Interpolated scale for smooth animation when alternative images appear/disappear
  private imageScaleFactor: InterpolatedProperty<number> = new InterpolatedProperty<number>('imageScale', 1.0, 1.0, 0.5); // Alternative product images for stacked display

  // AI Annotations for hero image
  public heroImageAnnotations: Array<{
    label: string;
    type: string;
    anchor: { x: number; y: number }; // 0-1 normalized
    box?: { x1: number; y1: number; x2: number; y2: number }; // 0-1 normalized
    confidence: number;
  }> | null = null;

  // Product overlay renderer (OOP class)
  private productOverlay: ProductOverlayCanvas;
  private productOverlayV2: ProductOverlayCanvasV2;

  // Toggle between V1 and V2 overlay
  public overlayVersion: 'v1' | 'v2' = 'v2'; // Default to V2

  // Image LOD tracking: nodeId -> current loaded size
  private loadedImageSizes = new Map<string, number>();

  // Current viewport bounds (updated each frame)
  private viewportLeft = 0;
  private viewportRight = 0;
  private viewportTop = 0;
  private viewportBottom = 0;
  private zoomFactor = 1;

  // Track loaded LOD level for pivot hero image
  private pivotHeroLoadedSize: number | null = null;

  // Use global shared image queue for truly sequential loading
  private imageLoadQueue = globalImageQueue;

  // Queue processing timing (non-blocking)
  private lastQueueProcessTime = 0;

  // Hit detection: Path2D objects for each rendered product
  private productPaths = new Map<string, { path: Path2D; product: T }>();

  constructor(
    private ctx: CanvasRenderingContext2D,
    private getNodes: () => LayoutNode<T>[],
    private renderAccessors: { label(item: T): string; priceText(item: T): string },
    private viewport: ViewportTransform | null = null,
    private getGroupHeaders: () => GroupHeaderInfo[] = () => []
  ) {
    this.productOverlay = new ProductOverlayCanvas(ctx, DEFAULT_OVERLAY_STYLE);
    this.productOverlayV2 = new ProductOverlayCanvasV2(ctx, MODERN_OVERLAY_STYLE);
  }

  /**
   * Compute the best-fit size for an image within a bounding box while preserving aspect ratio.
   */
  private getFittedDimensions(img: HTMLImageElement, boundsWidth: number, boundsHeight: number) {
    const naturalWidth = img.naturalWidth || boundsWidth || 1;
    const naturalHeight = img.naturalHeight || boundsHeight || 1;
    const scale = Math.min(boundsWidth / naturalWidth, boundsHeight / naturalHeight);
    const fittedWidth = naturalWidth * scale;
    const fittedHeight = naturalHeight * scale;
    return { width: fittedWidth, height: fittedHeight };
  }

  /**
   * Draw an image inside the specified bounds while preserving aspect ratio (centered letterbox).
   * Returns the actual drawn bounds for chaining calculations.
   */
  private drawImageFit(
    img: HTMLImageElement,
    boundsX: number,
    boundsY: number,
    boundsWidth: number,
    boundsHeight: number
  ) {
    const { width, height } = this.getFittedDimensions(img, boundsWidth, boundsHeight);
    const drawX = boundsX + (boundsWidth - width) / 2;
    const drawY = boundsY + (boundsHeight - height) / 2;
    this.ctx.drawImage(img, drawX, drawY, width, height);
    return { x: drawX, y: drawY, width, height };
  }
  
  start() {
    this.stop();

    // Render loop (60 FPS) with integrated queue processing
    const loop = (timestamp: number) => {
      this.draw();

      // Process queue in RAF loop (non-blocking, time-based rate limiting)
      if (LOD_CONFIG.enabled) {
        const timeSinceLastProcess = timestamp - this.lastQueueProcessTime;
        if (timeSinceLastProcess >= LOD_CONFIG.processInterval) {
          this.processQueue();
          this.lastQueueProcessTime = timestamp;
        }
      }

      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);

    // LOD scan loop - only start if enabled
    if (LOD_CONFIG.enabled) {
      this.lodUpdateInterval = window.setInterval(() => {
        this.updateImageLOD();
      }, LOD_CONFIG.scanInterval);
    }
  }

  stop() {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = null;

    if (this.lodUpdateInterval) clearInterval(this.lodUpdateInterval);
    this.lodUpdateInterval = null;
  }

  /**
   * Update image LOD based on screen size (1 FPS)
   * Scans visible nodes and adds load tasks to queue
   * Queue processor will re-check visibility before loading
   */
  private updateImageLOD() {
    if (!this.viewport) return;

    const nodes = this.getNodes();
    const scale = this.viewport.scale;
    const canvas = this.ctx.canvas;

    // Calculate visible viewport bounds in world space
    const viewportLeft = -this.viewport.offset.x / scale;
    const viewportTop = -this.viewport.offset.y / scale;
    const viewportRight = viewportLeft + (canvas.width / scale);
    const viewportBottom = viewportTop + (canvas.height / scale);

    // Store viewport bounds for shouldLoad validation
    this.viewportLeft = viewportLeft;
    this.viewportRight = viewportRight;
    this.viewportTop = viewportTop;
    this.viewportBottom = viewportBottom;
    this.zoomFactor = scale;

    let queuedCount = 0;

    for (const node of nodes) {
      const x = node.posX.value ?? 0;
      const y = node.posY.value ?? 0;
      const w = node.width.value ?? 0;
      const h = node.height.value ?? 0;

      // Visibility check: is this node in the visible viewport?
      const isVisible = !(
        x + w < viewportLeft ||   // completely left of viewport
        x > viewportRight ||       // completely right of viewport
        y + h < viewportTop ||     // completely above viewport
        y > viewportBottom         // completely below viewport
      );

      if (!isVisible) continue; // Skip invisible nodes

      // Calculate screen space size
      const screenWidth = w * scale;
      const screenHeight = h * scale;
      const screenSize = Math.max(screenWidth, screenHeight);

      // Determine required image size based on config
      const requiredSize = screenSize > LOD_CONFIG.transitionThreshold
        ? LOD_CONFIG.highResolution
        : LOD_CONFIG.lowResolution;

      // Check if we need to load a different size
      const currentSize = this.loadedImageSizes.get(node.id);

      if (currentSize !== requiredSize) {
        const product = node.data as any;
        const storageId = product.primaryImage?.storage_id;

        if (storageId) {
          // Calculate priority (lower = higher priority)
          // LOD images have low priority (1000+) - hero and dialog images load first
          const centerX = (viewportLeft + viewportRight) / 2;
          const centerY = (viewportTop + viewportBottom) / 2;
          const nodeCenterX = x + w / 2;
          const nodeCenterY = y + h / 2;
          const distanceFromCenter = Math.sqrt(
            Math.pow(nodeCenterX - centerX, 2) + Math.pow(nodeCenterY - centerY, 2)
          );

          const taskId = `lod-${node.id}-${requiredSize}`;
          const quality = requiredSize === LOD_CONFIG.highResolution ? LOD_CONFIG.highQuality : LOD_CONFIG.lowQuality;
          const imageUrl = buildMediaUrl({
            storageId,
            width: requiredSize,
            height: requiredSize,
            quality,
          });

          // Add to ImageLoadQueue (automatically handles duplicates and priority sorting)
          this.imageLoadQueue.add({
            id: taskId,
            url: imageUrl,
            group: 'lod',
            priority: 1000 + distanceFromCenter, // Lowest priority (hero=0, thumbnails=10+, variants=100+, LOD=1000+)
            metadata: {
              nodeId: node.id,
              storageId,
              size: requiredSize,
              priority: 1000 + distanceFromCenter
            }
          }).then(result => {
            // Image loaded successfully
            const product = node.data as any;
            if (product && typeof product.loadImageFromUrl === 'function') {
              product._image = result.image;
              this.loadedImageSizes.set(node.id, requiredSize);
            }
          }).catch(error => {
            // Only log real errors, not cancelled requests (expected behavior)
            if (error.error?.message !== 'Request cancelled' && error.error?.message !== 'Request no longer relevant') {
              console.warn('[LOD] Failed to load image:', error);
            }
          });

          queuedCount++;
        }
      }
    }

    // LOD for Pivot Hero Image (selected product)
    if (this.selectedProduct && this.selectedProductBounds) {
      const product = this.selectedProduct as any;
      const variantImages = product.variants?.length > 0
        ? (product.variants[0].media || [])
        : (product.media || []);

      if (variantImages.length > 0) {
        const heroImage = variantImages[0];
        const storageId = heroImage.storage_id;

        if (storageId) {
          // Calculate pivot image screen size (uses selectedProductBounds as reference)
          // Pivot is typically 2-3x the cell size
          const pivotScale = 2.5; // Pivot display scale multiplier
          const screenWidth = this.selectedProductBounds.width * scale * pivotScale;
          const screenHeight = this.selectedProductBounds.height * scale * pivotScale;
          const screenSize = Math.max(screenWidth, screenHeight);

          // Determine required LOD
          const requiredSize = screenSize > LOD_CONFIG.transitionThreshold
            ? LOD_CONFIG.highResolution
            : LOD_CONFIG.lowResolution;

          // Check if we need to load different size
          if (this.pivotHeroLoadedSize !== requiredSize) {
            const quality = requiredSize === LOD_CONFIG.highResolution ? LOD_CONFIG.highQuality : LOD_CONFIG.lowQuality;
            const imageUrl = buildMediaUrl({
              storageId,
              width: requiredSize,
              height: requiredSize,
              quality,
            });

            // Priority 0 = highest priority (pivot is most important)
            this.imageLoadQueue.add({
              id: `pivot-hero-${storageId}-${requiredSize}`,
              url: imageUrl,
              group: 'pivot',
              priority: 0, // Highest priority
              metadata: {
                nodeId: 'pivot',
                storageId,
                size: requiredSize,
                priority: 0
              }
            }).then(result => {
              // Update pivot hero image
              this.selectedVariantHeroImage = result.image;
              this.pivotHeroLoadedSize = requiredSize;
            }).catch(error => {
              if (error.error?.message !== 'Request cancelled' && error.error?.message !== 'Request no longer relevant') {
                console.warn('[LOD] Failed to load pivot hero:', error);
              }
            });

            queuedCount++;
          }
        }
      }
    }
  }

  /**
   * Process image load queue (no longer needed - ImageLoadQueue handles this)
   * Kept as empty method for backwards compatibility
   */
  private processQueue() {
    // ImageLoadQueue now handles all queue processing automatically
    // No manual processing needed
  }

  /**
   * loadImageForNode is no longer used - ImageLoadQueue handles loading directly
   */
  private loadImageForNode(node: LayoutNode<T>, size: number) {
    // No-op: ImageLoadQueue handles all image loading now
  }

  private clear() { 
    const c = this.ctx.canvas; 
    this.ctx.clearRect(0,0,c.width,c.height); 
  }

  /**
   * Update hero mode offsets for products (makes them move aside when alternative images spread)
   */
  private updateHeroModeOffsets() {
    if (!this.selectedProduct || !this.alternativeImages || this.alternativeImages.length === 0) {
      // No selected product or no alternative images - reset all offsets to 0
      const nodes = this.getNodes();
      for (const n of nodes) {
        n.heroOffsetX.targetValue = 0;
      }
      return;
    }

    const nodes = this.getNodes();
    const loadedImages = this.alternativeImages.filter(img => img.loadedImage);
    if (loadedImages.length === 0) {
      // No loaded images yet - reset offsets
      for (const n of nodes) {
        n.heroOffsetX.targetValue = 0;
      }
      return;
    }

    // Find the selected product node
    let selectedNode: any = null;
    let selectedIndex = -1;
    for (let i = 0; i < nodes.length; i++) {
      const product = nodes[i].data as any;
      if (product.id === this.selectedProduct.id) {
        selectedNode = nodes[i];
        selectedIndex = i;
        break;
      }
    }

    if (!selectedNode) {
      // Selected product not found - reset offsets
      for (const n of nodes) {
        n.heroOffsetX.targetValue = 0;
      }
      return;
    }

    // Calculate how much space the alternative images need
    // Use the same calculation as in the spread animation
    const w = selectedNode.width.value ?? 0;
    const h = selectedNode.height.value ?? 0;
    const aspectRatio = w / h;
    const isClearlyLandscape = aspectRatio > 1.2;

    // Determine spread direction based on setting
    let shouldSpreadVertically = false;
    if (this.imageSpreadDirection === 'vertical') {
      shouldSpreadVertically = true;
    } else if (this.imageSpreadDirection === 'horizontal') {
      shouldSpreadVertically = false;
    } else {
      // Auto mode: use aspect ratio
      shouldSpreadVertically = isClearlyLandscape;
    }

    // Base offset calculation (same as in spread animation, but with more space in hero mode)
    // Vertical spreading uses smaller offset (0.08) to keep images very tight
    const baseOffset = shouldSpreadVertically ? h * 0.08 : w * 0.25;

    // Only calculate and apply horizontal offsets for neighboring products if spreading horizontally
    // When spreading vertically (up/down), we don't need to move neighbors left/right
    let maxLeftOffset = 0;
    let maxRightOffset = 0;

    if (!shouldSpreadVertically) {
      // Calculate total spread width needed (maximum distance on either side)
      // We use the same symmetric spread logic: alternating left/right
      const imageCount = loadedImages.length;

      for (let i = 0; i < imageCount; i++) {
        const side = i % 2 === 0 ? -1 : 1;
        const distance = Math.floor(i / 2) + 1;
        const offset = side * distance * baseOffset;

        if (offset < 0) {
          maxLeftOffset = Math.min(maxLeftOffset, offset);
        } else {
          maxRightOffset = Math.max(maxRightOffset, offset);
        }
      }
    }

    // Now apply offsets to all other products
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      const product = n.data as any;

      if (product.id === this.selectedProduct.id) {
        // Selected product stays in place
        n.heroOffsetX.targetValue = 0;
      } else if (i < selectedIndex) {
        // Products to the left of selected product move left with extra spacing
        n.heroOffsetX.targetValue = maxLeftOffset * 2.0; // Double the offset for more space
      } else {
        // Products to the right of selected product move right with extra spacing
        n.heroOffsetX.targetValue = maxRightOffset * 2.0; // Double the offset for more space
      }
    }
  }

  private drawRoundedRect(x: number, y: number, width: number, height: number, radius: number) {
    const r = Math.min(radius, height / 2, width / 2);
    this.ctx.beginPath();
    this.ctx.moveTo(x + r, y);
    this.ctx.lineTo(x + width - r, y);
    this.ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    this.ctx.lineTo(x + width, y + height - r);
    this.ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    this.ctx.lineTo(x + r, y + height);
    this.ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    this.ctx.lineTo(x, y + r);
    this.ctx.quadraticCurveTo(x, y, x + r, y);
    this.ctx.closePath();
  }

  /**
   * Truncate text to fit within maxWidth, adding ellipsis if needed
   * Returns the truncated text
   */
  private truncateText(text: string, maxWidth: number): string {
    const metrics = this.ctx.measureText(text);
    if (metrics.width <= maxWidth) {
      return text;
    }

    // Binary search for the right length
    let low = 0;
    let high = text.length;
    let best = '';

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const testText = text.substring(0, mid) + '...';
      const testMetrics = this.ctx.measureText(testText);

      if (testMetrics.width <= maxWidth) {
        best = testText;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    return best || '...';
  }

  private async draw() {
    const c = this.ctx.canvas;
    if (c.width !== c.clientWidth || c.height !== c.clientHeight) {
      c.width = c.clientWidth;
      c.height = c.clientHeight;
    }

    this.clear();

    // Update viewport interpolation (smooth camera)
    if (this.viewport) {
      this.viewport.update();
    }

    // Apply viewport transform
    this.ctx.save();
    if (this.viewport) {
      this.viewport.applyTransform(this.ctx);
    }
    
    const nodes = this.getNodes();

    // Update hero mode offsets if needed (products moving aside for spread animation)
    this.updateHeroModeOffsets();

    for (const n of nodes) {
      const baseX = n.posX.value ?? 0;
      const heroOffset = n.heroOffsetX.value ?? 0;
      const x = baseX + heroOffset; // Apply hero mode offset
      const y = n.posY.value ?? 0;
      const w = n.width.value ?? 0, h = n.height.value ?? 0;
      const scale = n.scale.value ?? 1;
      const opacity = n.opacity.value ?? 1;
      
      // Skip if fully transparent
      if (opacity <= 0.01) continue;
      
      // Get product and ensure image is loaded (OOP self-managed)
      const product = n.data as any as Product;
      if (!product.isImageReady) {
        // Trigger async load (non-blocking)
        product.loadImage();

        // Draw placeholder tile while image loads
        const radius = Math.min(18, Math.min(w, h) / 4);
        this.drawRoundedRect(x, y, w, h, radius);
        this.ctx.fillStyle = 'rgba(22, 32, 62, 0.85)';
        this.ctx.fill();

        this.ctx.lineWidth = 1.5;
        this.ctx.strokeStyle = 'rgba(102, 132, 255, 0.45)';
        this.ctx.setLineDash([8, 6]);
        this.ctx.stroke();
        this.ctx.setLineDash([]);

        this.ctx.fillStyle = 'rgba(180, 195, 255, 0.82)';
        this.ctx.font = '600 12px "Inter", system-ui';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        const label = this.renderAccessors.label(product as any);
        this.ctx.fillText(label, x + w / 2, y + h / 2, Math.max(24, w - 16));

        continue;
      }

      const isFocused = this.focusedItem === n.data;
      const isSelectedProduct = this.selectedProduct && (product as any).id === this.selectedProduct.id;

      // Use variant-specific hero image if available (for selected product)
      let img = product.image;
      if (isSelectedProduct && this.selectedVariantHeroImage) {
        img = this.selectedVariantHeroImage;
      }
      if (!img) continue;

      // Apply scale transform
      this.ctx.save();
      const centerX = x + w / 2;
      const centerY = y + h / 2;
      this.ctx.translate(centerX, centerY);
      this.ctx.scale(scale, scale);
      this.ctx.translate(-centerX, -centerY);

      // Draw alternative images stacked behind (only for selected product with dialog open)
      if (isSelectedProduct && this.alternativeImages && this.alternativeImages.length > 0) {
        // Count loaded images
        const loadedImages = this.alternativeImages.filter(img => img.loadedImage);
        const imageCount = loadedImages.length;

        if (imageCount > 0) {
          // Detect orientation: Only clearly landscape images spread vertically
          // Everything else (portrait, square) spreads horizontally
          const aspectRatio = w / h;
          const isClearlyLandscape = aspectRatio > 1.2; // Width at least 20% larger than height

          // Calculate scaling and spacing to fit all images in cell
          // Total images to draw: main image + alternative images
          const totalImages = imageCount + 1;

          // Overlap factor: how much images overlap (0.4 = 40% overlap, so 60% of next image visible)
          // Lower value = more spread, more space between images
          const overlapFactor = 0.4;

          // Calculate scale factor so all images fit in the cell
          const spreadFactor = 1 + (totalImages - 1) * (1 - overlapFactor);
          let targetScale = 1 / spreadFactor;

          // Don't scale down too much - keep at least 75% of original size
          targetScale = Math.max(targetScale, 0.75);

          // Set target value for smooth animation
          this.imageScaleFactor.targetValue = targetScale;

          // Use animated scale value
          const animatedScale = this.imageScaleFactor.value ?? 1.0;

          // Calculate scaled bounding box with animated scale
          const boundingWidth = w * animatedScale;
          const boundingHeight = h * animatedScale;

          // Determine spread direction based on setting
          let shouldSpreadVertically = false;
          if (this.imageSpreadDirection === 'vertical') {
            shouldSpreadVertically = true;
          } else if (this.imageSpreadDirection === 'horizontal') {
            shouldSpreadVertically = false;
          } else {
            // Auto mode: use aspect ratio
            shouldSpreadVertically = isClearlyLandscape;
          }

          // Calculate offset between images based on spread direction
          // Vertical spreading uses smaller offset (0.35) to keep images very tight
          const axisSize = shouldSpreadVertically ? boundingHeight : boundingWidth;
          const baseOffset = shouldSpreadVertically ? axisSize * 0.35 : axisSize * (1 - overlapFactor);

          // Initialize InterpolatedProperty for each image if needed
          // Spread symmetrically: left, right, left, right, ...
          for (let i = 0; i < imageCount; i++) {
            const altImg = loadedImages[i];
            if (altImg && !altImg.spreadOffset) {
              // Create InterpolatedProperty starting at 0, animating to target offset
              altImg.spreadOffset = new InterpolatedProperty<number>(`spread-${i}`, 0, 0, 0.5);

              // Calculate symmetric offset:
              // i=0: -baseOffset (left)
              // i=1: +baseOffset (right)
              // i=2: -2*baseOffset (further left)
              // i=3: +2*baseOffset (further right)
              const side = i % 2 === 0 ? -1 : 1; // Alternate left (-1) and right (+1)
              const distance = Math.floor(i / 2) + 1; // Distance multiplier (1, 1, 2, 2, 3, 3, ...)
              altImg.spreadOffset.targetValue = side * distance * baseOffset;
            }
          }

          // Calculate centering offset to keep images centered when scaled down
          const centerOffsetX = (w - boundingWidth) / 2;
          const centerOffsetY = (h - boundingHeight) / 2;

          // Draw from back to front (furthest images first)
          for (let i = imageCount - 1; i >= 0; i--) {
            const altImg = loadedImages[i];
            if (altImg && altImg.loadedImage && altImg.spreadOffset) {
              // Use animated offset from InterpolatedProperty
              const stackOffset = altImg.spreadOffset.value ?? 0;

              let stackedX = x + centerOffsetX;
              let stackedY = y + centerOffsetY;

              // Determine spread direction based on setting
              let shouldSpreadVertically = false;
              if (this.imageSpreadDirection === 'vertical') {
                shouldSpreadVertically = true;
              } else if (this.imageSpreadDirection === 'horizontal') {
                shouldSpreadVertically = false;
              } else {
                // Auto mode: use aspect ratio
                shouldSpreadVertically = isClearlyLandscape;
              }

              if (shouldSpreadVertically) {
                // Spread vertically (Y-axis)
                stackedY = y + centerOffsetY + stackOffset;
              } else {
                // Spread horizontally (X-axis)
                stackedX = x + centerOffsetX + stackOffset;
              }

              // Draw the alternative image with transparency and scaling
              this.ctx.globalAlpha = 0.9 - (Math.floor(i / 2) * 0.1);
              this.drawImageFit(
                altImg.loadedImage,
                stackedX,
                stackedY,
                boundingWidth,
                boundingHeight
              );
            }
          }
          this.ctx.globalAlpha = 1;
        }
      }

      // Draw main image (scaled same as alternative images if they exist)
      this.ctx.globalAlpha = opacity;

      if (isSelectedProduct && this.alternativeImages && this.alternativeImages.length > 0) {
        const loadedImages = this.alternativeImages.filter(img => img.loadedImage);
        if (loadedImages.length > 0) {
          // Use animated scale value (already set above in alternative images section)
          const animatedScale = this.imageScaleFactor.value ?? 1.0;

          // Center the scaled image
          const scaledWidth = w * animatedScale;
          const scaledHeight = h * animatedScale;
          const centerOffsetX = (w - scaledWidth) / 2;
          const centerOffsetY = (h - scaledHeight) / 2;

          this.drawImageFit(
            img,
            x + centerOffsetX,
            y + centerOffsetY,
            scaledWidth,
            scaledHeight
          );
        } else {
          // No loaded images yet - reset scale to 1.0
          this.imageScaleFactor.targetValue = 1.0;
          this.drawImageFit(img, x, y, w, h);
        }
      } else {
        // No alternative images - reset scale to 1.0 smoothly
        this.imageScaleFactor.targetValue = 1.0;
        this.drawImageFit(img, x, y, w, h);
      }

      this.ctx.globalAlpha = 1;
      
      // Only show focus indicator for keyboard navigation
      if (isFocused) {
        // Subtle green border for focused item
        this.ctx.strokeStyle = '#10b981';
        this.ctx.lineWidth = 3;
        this.ctx.strokeRect(x, y, w, h);
        
        // Dashed outer border for extra visibility
        this.ctx.setLineDash([8, 4]);
        this.ctx.strokeStyle = '#10b981';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(x - 6, y - 6, w + 12, h + 12);
        this.ctx.setLineDash([]);
      }
      
      // NO TEXT RENDERING - Clean Microsoft Pivot style!
      // Text will be shown in tooltip on hover
      
      // Restore item transform
      this.ctx.restore();
    }
    
    // Draw group headers (after products, so they're on top) - matching .pf-pivot-chip style
    const groupHeaders = this.getGroupHeaders();
    for (const header of groupHeaders) {
      const isHovered = this.hoveredGroupKey === header.key;

      // Rounded corners like .pf-pivot-chip (10px)
      const radius = 10;

      // Gradient matching .pf-pivot-chip style
      const gradient = this.ctx.createLinearGradient(
        header.x,
        header.y,
        header.x + header.width,
        header.y + header.height
      );
      if (isHovered) {
        // Lighter hover gradient (like .pf-pivot-chip:hover)
        gradient.addColorStop(0, '#3ab8ff');
        gradient.addColorStop(1, '#22e4ee');
      } else {
        // Default gradient: linear-gradient(145deg, #2aa8ef 0%, #12d4de 100%)
        gradient.addColorStop(0, '#2aa8ef');
        gradient.addColorStop(1, '#12d4de');
      }

      // Apply slight Y offset for hover effect (matching translateY(-2px))
      const yOffset = isHovered ? -2 : 0;

      this.drawRoundedRect(header.x, header.y + yOffset, header.width, header.height, radius);
      this.ctx.fillStyle = gradient;
      this.ctx.fill();

      // No border (matching .pf-pivot-chip)
      // Add subtle shadow for hover
      if (isHovered) {
        this.ctx.shadowColor = 'rgba(42, 168, 239, 0.3)';
        this.ctx.shadowBlur = 12;
        this.ctx.shadowOffsetY = 4;
        this.ctx.fill(); // Re-fill with shadow
        this.ctx.shadowColor = 'transparent';
        this.ctx.shadowBlur = 0;
        this.ctx.shadowOffsetY = 0;
      }

      // White text (matching .pf-pivot-chip)
      this.ctx.fillStyle = 'white';
      this.ctx.font = isHovered ? 'bold 14px system-ui' : '13px system-ui';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';

      // Calculate available width for text (leave padding on both sides)
      const textPadding = 20;
      const maxTextWidth = header.width - (textPadding * 2);

      // Truncate text if needed
      const displayText = this.truncateText(header.label, maxTextWidth);
      const isTruncated = displayText !== header.label;

      this.ctx.fillText(
        displayText,
        header.x + header.width / 2,
        header.y + yOffset + header.height / 2
      );

      // Draw click hint or full text tooltip on hover
      if (isHovered) {
        if (isTruncated) {
          // Show full text as tooltip above the button
          const tooltipPadding = 12;
          const tooltipFont = '14px system-ui';
          this.ctx.font = tooltipFont;
          const tooltipMetrics = this.ctx.measureText(header.label);
          const tooltipWidth = tooltipMetrics.width + tooltipPadding * 2;
          const tooltipHeight = 32;
          const tooltipX = header.x + header.width / 2 - tooltipWidth / 2;
          const tooltipY = header.y + yOffset - tooltipHeight - 8;

          // Draw tooltip background
          this.drawRoundedRect(tooltipX, tooltipY, tooltipWidth, tooltipHeight, 8);
          this.ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
          this.ctx.fill();
          this.ctx.lineWidth = 1;
          this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
          this.ctx.stroke();

          // Draw full text in tooltip (white on dark background)
          this.ctx.fillStyle = '#ffffff';
          this.ctx.font = tooltipFont;
          this.ctx.textAlign = 'center';
          this.ctx.textBaseline = 'middle';
          this.ctx.fillText(
            header.label,
            tooltipX + tooltipWidth / 2,
            tooltipY + tooltipHeight / 2
          );
        } else {
          // Show click hint if not truncated - white text with slight transparency
          this.ctx.font = '11px system-ui';
          this.ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
          this.ctx.textAlign = 'center';
          this.ctx.textBaseline = 'middle';
          this.ctx.fillText(
            'Click to drill down',
            header.x + header.width / 2,
            header.y + yOffset + header.height / 2 + 12
          );
        }
      }
    }

    // Draw dialog connection line (React overlay mode) - IN CANVAS SPACE
    if (this.dialogConnectionPoint && this.dialogPosition && this.viewport) {
      // Transform dialog position from screen space back to canvas space
      const scale = this.viewport.getTargetScale();
      const offset = this.viewport.getTargetOffset();
      const canvasDialogX = (this.dialogPosition.x - offset.x) / scale;
      const canvasDialogY = (this.dialogPosition.y - offset.y) / scale;

      // Draw dashed line from product to dialog (in canvas space)
      this.ctx.save();
      // Scale-invariant dash pattern
      this.ctx.setLineDash([8 / scale, 8 / scale]);
      this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
      this.ctx.lineWidth = 3 / scale; // Scale-invariant line width
      this.ctx.beginPath();
      this.ctx.moveTo(this.dialogConnectionPoint.x, this.dialogConnectionPoint.y);
      this.ctx.lineTo(canvasDialogX, canvasDialogY);
      this.ctx.stroke();
      this.ctx.setLineDash([]);

      // Draw white dot at product center (in canvas space)
      this.ctx.beginPath();
      this.ctx.arc(this.dialogConnectionPoint.x, this.dialogConnectionPoint.y, 8 / scale, 0, Math.PI * 2);
      this.ctx.fillStyle = 'white';
      this.ctx.fill();
      this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
      this.ctx.lineWidth = 2 / scale;
      this.ctx.stroke();

      this.ctx.restore();
    }

    // Draw AI annotations on hero image (in canvas, VOR restore)
    if (this.heroImageAnnotations && this.selectedProduct && this.viewport) {
      const node = this.getNodes().find(n => {
        const product = n.data as any as Product;
        return product && product.id === this.selectedProduct!.id;
      });
      if (node) {
        this.drawAnnotationDots(
          this.heroImageAnnotations,
          node,
          this.viewport
        );
      }
    }

    // Draw selected product overlay (in world space)
    if (this.selectedProduct && this.selectedProductAnchor && this.viewport && this.heroDisplayMode === 'overlay') {
      this.drawProductOverlay(this.selectedProduct, this.selectedProductAnchor.x, this.selectedProductAnchor.y);
    }

    // Restore viewport transform
    this.ctx.restore();

    // DEBUG content-bounds visualization intentionally removed for TypeScript strict mode.
  }

  /**
   * Wrap text to fit within a maximum width
   */
  private wrapText(text: string, maxWidth: number, fontSize: number, fontWeight: string = ''): string[] {
    const lines: string[] = [];
    this.ctx.font = `${fontWeight} ${fontSize}px system-ui`;

    const words = text.split(' ');
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const metrics = this.ctx.measureText(testLine);

      if (metrics.width > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }

    if (currentLine) {
      lines.push(currentLine);
    }

    return lines;
  }

  /**
   * Draw product overlay directly on canvas in world space
   */
  /**
   * Draw product detail overlay (Hero Mode)
   * Uses the ProductOverlayCanvas OOP class for clean separation of concerns
   */
  private drawProductOverlay(product: Product, anchorX: number, anchorY: number) {
    if (!this.viewport) return;
    if (!this.selectedProductBounds) {
      console.warn('[CanvasRenderer] No product bounds available for overlay');
      return;
    }

    this.ctx.save();

    if (this.overlayVersion === 'v2') {
      // V2: Centered overlay, no viewport transform
      // Preload image if not loaded yet
      if (!this.productOverlayV2['currentProductImage']) {
        this.productOverlayV2.preloadImage(product).catch(err => {
          console.warn('[CanvasRenderer] Failed to preload V2 image:', err);
        });
      }

      this.productOverlayV2.render(product, this.ctx.canvas.width, this.ctx.canvas.height);
    } else {
      // V1: World-space overlay
      this.viewport.applyTransform(this.ctx);

      // Convert bounds format (x,y -> left,top)
      const bounds = {
        left: this.selectedProductBounds.x,
        top: this.selectedProductBounds.y,
        width: this.selectedProductBounds.width,
        height: this.selectedProductBounds.height
      };

      this.productOverlay.render(product, bounds, anchorY);
    }

    this.ctx.restore();
  }


  /**
   * Check if a click (in screen coordinates) hits the overlay or its buttons
   * Returns: 'close' | 'view' | 'cart' | 'background' | null
   * - null: clicked outside overlay (should continue with normal click handling)
   * - 'background': clicked on overlay but not a button (consume click, do nothing)
   * - 'close'/'view'/'cart': clicked a specific button
   */
  /**
   * Check if a click hits the overlay or its buttons
   * Delegates to the ProductOverlayCanvas OOP class
   */
  public checkOverlayClick(screenX: number, screenY: number): 'close' | 'view' | 'cart' | 'add-to-cart' | 'view-website' | 'background' | null {
    if (!this.viewport) return null;

    if (this.overlayVersion === 'v2') {
      // V2: Screen coordinates directly
      return this.productOverlayV2.checkClick(screenX, screenY);
    } else {
      // V1: World space coordinates
      return this.productOverlay.checkClick(screenX, screenY, {
        scale: this.viewport.scale,
        offset: this.viewport.offset
      });
    }
  }

  /**
   * Draw AI annotation dots on the hero product image (in world space, scale-invariant sizes)
   */
  private drawAnnotationDots(
    annotations: Array<{
      label: string;
      type: string;
      anchor: { x: number; y: number };
      box?: { x1: number; y1: number; x2: number; y2: number };
      confidence: number;
    }>,
    node: LayoutNode<T>,
    viewport: ViewportTransform
  ): void {
    const scale = viewport.getTargetScale();

    // Get product image bounds (in world space)
    const x = node.posX.targetValue ?? node.posX.value ?? 0;
    const y = node.posY.targetValue ?? node.posY.value ?? 0;
    let width = node.width.targetValue ?? node.width.value ?? 0;
    let height = node.height.targetValue ?? node.height.value ?? 0;

    // Account for image scaling when multiple images are stacked
    if (this.alternativeImages && this.alternativeImages.length > 0) {
      const loadedImages = this.alternativeImages.filter(img => img.loadedImage);
      if (loadedImages.length > 0) {
        const totalImages = loadedImages.length + 1;
        const overlapFactor = 0.7;
        const spreadFactor = 1 + (totalImages - 1) * (1 - overlapFactor);
        let targetScale = 1 / spreadFactor;
        targetScale = Math.max(targetScale, 0.85);

        width = width * targetScale;
        height = height * targetScale;
      }
    }

    this.ctx.save();

    // Calculate all label positions and detect collisions
    // Sizes proportional to image height for correct scaling
    const fontSize = height * 0.0125; // 1.25% of image height
    const padding = height * 0.005;
    const labelPadding = height * 0.0025;

    // First pass: calculate positions and dimensions
    interface LabelLayout {
      annotation: typeof annotations[0];
      dotX: number;
      dotY: number;
      textX: number;
      textY: number;
      textWidth: number;
      textHeight: number;
      bounds: { x: number; y: number; width: number; height: number };
    }

    const labels: LabelLayout[] = [];
    this.ctx.font = `${fontSize}px system-ui, -apple-system, sans-serif`;

    for (const annotation of annotations) {
      const dotX = x + annotation.anchor.x * width;
      const dotY = y + annotation.anchor.y * height;
      const textX = dotX + height * 0.015; // 1.5% of image height
      let textY = dotY;

      const textMetrics = this.ctx.measureText(annotation.label);
      const textWidth = textMetrics.width;
      const textHeight = fontSize * 2.2; // Include space for confidence

      labels.push({
        annotation,
        dotX,
        dotY,
        textX,
        textY,
        textWidth,
        textHeight,
        bounds: {
          x: textX - padding,
          y: textY - textHeight / 2 - padding,
          width: textWidth + padding * 2,
          height: textHeight + padding * 2,
        },
      });
    }

    // Second pass: resolve collisions by shifting labels vertically
    // Sort by Y position to process top-to-bottom
    labels.sort((a, b) => a.textY - b.textY);

    for (let i = 0; i < labels.length; i++) {
      for (let j = 0; j < i; j++) {
        const labelA = labels[i];
        const labelB = labels[j];

        // Check for overlap
        const overlapX =
          labelA.bounds.x < labelB.bounds.x + labelB.bounds.width &&
          labelA.bounds.x + labelA.bounds.width > labelB.bounds.x;

        const overlapY =
          labelA.bounds.y < labelB.bounds.y + labelB.bounds.height + labelPadding &&
          labelA.bounds.y + labelA.bounds.height + labelPadding > labelB.bounds.y;

        if (overlapX && overlapY) {
          // Shift both dot and label down to avoid overlap
          const shiftAmount = (labelB.bounds.y + labelB.bounds.height + labelPadding) - labelA.bounds.y;
          labelA.textY += shiftAmount;
          labelA.dotY += shiftAmount;
          labelA.bounds.y += shiftAmount;
        }
      }
    }

    // Third pass: draw everything
    for (const label of labels) {
      const { annotation, dotX, dotY, textX, textY, textWidth, textHeight } = label;

      // Sizes proportional to image height
      const dotSize = height * 0.006; // 0.6% of image height
      const pulseSize = height * 0.01; // 1% of image height

      // Draw pulsing ring (animated based on time)
      const time = Date.now() / 1000;
      const pulsePhase = (time % 2) / 2; // 0-1 over 2 seconds
      const pulseSizeCurrent = pulseSize * (1 + pulsePhase);
      const pulseOpacity = 1 - pulsePhase;

      this.ctx.beginPath();
      this.ctx.arc(dotX, dotY, pulseSizeCurrent, 0, Math.PI * 2);
      this.ctx.strokeStyle = `rgba(255, 107, 0, ${pulseOpacity * 0.8})`;
      this.ctx.lineWidth = height * 0.002;
      this.ctx.stroke();

      // Draw inner white circle
      this.ctx.beginPath();
      this.ctx.arc(dotX, dotY, dotSize, 0, Math.PI * 2);
      this.ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      this.ctx.fill();

      // Draw orange border
      this.ctx.strokeStyle = '#ff6b00';
      this.ctx.lineWidth = height * 0.002;
      this.ctx.stroke();

      // Draw text background
      this.ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
      this.ctx.fillRect(
        textX - padding,
        textY - textHeight / 2 - padding,
        textWidth + padding * 2,
        textHeight + padding * 2
      );

      // Draw text
      this.ctx.font = `${fontSize}px system-ui, -apple-system, sans-serif`;
      this.ctx.textAlign = 'left';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillStyle = '#ffffff';
      this.ctx.fillText(annotation.label, textX, textY);

      // Draw confidence below if available
      if (annotation.confidence) {
        const confidenceText = `${Math.round(annotation.confidence * 100)}%`;
        const confidenceFontSize = height * 0.009; // 0.9% of image height
        this.ctx.font = `${confidenceFontSize}px system-ui, -apple-system, sans-serif`;
        this.ctx.fillStyle = 'rgba(255, 107, 0, 0.9)';
        this.ctx.fillText(confidenceText, textX, textY + fontSize * 0.8);
      }
    }

    this.ctx.restore();
  }
}
