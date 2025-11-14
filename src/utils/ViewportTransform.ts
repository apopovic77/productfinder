import { Vector2 } from 'arkturian-typescript-utils';

export interface ContentBounds {
  width: number;
  height: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  maxItemHeight?: number; // Maximum height of a single item (for zoom limit calculation)
}

export class ViewportTransform {
  // Current interpolated values (what's actually rendered)
  public scale = 1;
  public offset = new Vector2(0, 0);

  // Target values (where we want to go)
  private targetScale = 1;
  private targetOffset = new Vector2(0, 0);

  // Interpolation speed (0-1, higher = faster, e.g., 0.15 means 15% per frame)
  public speedFactor = 0.15;

  // Scale limits
  private fitToContentScale = 1; // Calculated from content bounds
  public maxScale = 2; // Dynamically calculated: fitToContentScale × 2

  // Rubber banding config (iOS-style)
  private enableRubberBanding = true;
  private rubberBandResistance = 0.5; // 0-1, how much resistance (higher = more resistance)
  private rubberBandSpringBack = 0.08; // Speed of spring back (higher = faster)
  private lockVerticalPan = false; // If true, disable vertical panning and rubber banding

  // Content bounds for bounds checking
  private contentBounds: ContentBounds | null = null;
  public viewportWidth = 0;
  public viewportHeight = 0;

  private isDragging = false;
  private dragStart = new Vector2(0, 0);
  private offsetStart = new Vector2(0, 0);
  
  constructor(private canvas: HTMLCanvasElement) {
    this.viewportWidth = canvas.width;
    this.viewportHeight = canvas.height;
    this.setupEventListeners();
  }

  /**
   * Set content bounds to enable bounds checking and calculate fit-to-content scale.
   * This should be called whenever the layout changes.
   */
  setContentBounds(bounds: ContentBounds): void {
    this.contentBounds = bounds;
    this.updateViewportSize();
    this.calculateFitToContentScale();
  }

  /**
   * Update viewport size (called on canvas resize)
   */
  updateViewportSize(): void {
    this.viewportWidth = this.canvas.width;
    this.viewportHeight = this.canvas.height;
    this.calculateFitToContentScale();
  }

  /**
   * Lock vertical panning (horizontal-only scrolling)
   */
  setLockVerticalPan(lock: boolean): void {
    this.lockVerticalPan = lock;
  }

  /**
   * Calculate the scale needed to fit all content in viewport
   * Also sets maxScale so a product can be at most 2× screen height
   */
  private calculateFitToContentScale(): void {
    if (!this.contentBounds || this.viewportWidth === 0 || this.viewportHeight === 0) {
      this.fitToContentScale = 1;
      this.maxScale = 2; // Fallback
      return;
    }

    const scaleX = this.viewportWidth / this.contentBounds.width;
    const scaleY = this.viewportHeight / this.contentBounds.height;

    // Use the smaller scale to ensure everything fits
    this.fitToContentScale = Math.min(scaleX, scaleY); // No padding, exact fit

    // Max zoom: largest product can be at most 2× the screen height
    // Formula: maxProductHeight * maxScale = screenHeight * 2
    // So: maxScale = (screenHeight * 2) / maxProductHeight
    if (this.contentBounds.maxItemHeight && this.contentBounds.maxItemHeight > 0) {
      this.maxScale = (this.viewportHeight * 2) / this.contentBounds.maxItemHeight;
    } else {
      // Fallback if no maxItemHeight provided
      this.maxScale = this.fitToContentScale * 4;
    }
  }

  /**
   * Get minimum allowed scale (can't zoom out further than fit-to-content)
   */
  get minScale(): number {
    // Allow zooming out to 90% of fit-to-content for some breathing room
    return this.fitToContentScale * 0.9;
  }

  /**
   * Get current content bounds for debugging
   */
  getContentBounds(): ContentBounds | null {
    return this.contentBounds;
  }

  /**
   * Smooth interpolation update - call this every frame!
   * Formula: curr += (target - curr) * speedFactor
   */
  update(): void {
    // Apply rubber banding / spring back if not dragging
    if (!this.isDragging && this.enableRubberBanding) {
      this.applyRubberBanding();
    }

    // Interpolate scale
    this.scale += (this.targetScale - this.scale) * this.speedFactor;

    // Interpolate offset
    this.offset.x += (this.targetOffset.x - this.offset.x) * this.speedFactor;
    this.offset.y += (this.targetOffset.y - this.offset.y) * this.speedFactor;
  }

  getTargetScale(): number {
    return this.targetScale;
  }

  getTargetOffset(): { x: number; y: number } {
    return { x: this.targetOffset.x, y: this.targetOffset.y };
  }

  /**
   * Calculate valid bounds for current scale
   */
  private calculateBounds(): {
    minOffsetX: number;
    maxOffsetX: number;
    minOffsetY: number;
    maxOffsetY: number;
    centerX: number;
    centerY: number;
    shouldCenterX: boolean;
    shouldCenterY: boolean;
  } | null {
    if (!this.contentBounds) return null;

    const scaledWidth = this.contentBounds.width * this.targetScale;
    const scaledHeight = this.contentBounds.height * this.targetScale;

    // Content smaller than viewport? → Center it
    const shouldCenterX = scaledWidth < this.viewportWidth;
    const shouldCenterY = scaledHeight < this.viewportHeight;

    // Center content accounting for its origin (minX, minY)
    const centerX = (this.viewportWidth - scaledWidth) / 2 - this.contentBounds.minX * this.targetScale;
    const centerY = (this.viewportHeight - scaledHeight) / 2 - this.contentBounds.minY * this.targetScale;

    // Bounds: account for extended content bounds (e.g., Hero Mode allows edge products to center)
    // If minX < 0, content was extended to the left → allow panning right (positive maxOffsetX)
    // If content extends beyond viewport, allow panning left (negative minOffsetX)
    const maxOffsetX = shouldCenterX ? centerX : -this.contentBounds.minX * this.targetScale;
    const minOffsetX = shouldCenterX ? centerX : this.viewportWidth - scaledWidth - this.contentBounds.minX * this.targetScale;
    const maxOffsetY = shouldCenterY ? centerY : -this.contentBounds.minY * this.targetScale;
    const minOffsetY = shouldCenterY ? centerY : this.viewportHeight - scaledHeight - this.contentBounds.minY * this.targetScale;

    return {
      minOffsetX,
      maxOffsetX,
      minOffsetY,
      maxOffsetY,
      centerX,
      centerY,
      shouldCenterX,
      shouldCenterY,
    };
  }

  /**
   * Apply iOS-style rubber banding: spring back to bounds when not dragging
   */
  private applyRubberBanding(): void {
    // Clamp scale first (no rubber banding for scale, just hard limits)
    this.targetScale = Math.max(this.minScale, Math.min(this.maxScale, this.targetScale));

    const bounds = this.calculateBounds();
    if (!bounds) return;

    // Spring back to center if content is smaller than viewport
    if (bounds.shouldCenterX) {
      const distanceX = bounds.centerX - this.targetOffset.x;
      this.targetOffset.x += distanceX * this.rubberBandSpringBack;
    } else {
      // Spring back if outside bounds
      if (this.targetOffset.x > bounds.maxOffsetX) {
        const overflow = this.targetOffset.x - bounds.maxOffsetX;
        this.targetOffset.x -= overflow * this.rubberBandSpringBack;
      } else if (this.targetOffset.x < bounds.minOffsetX) {
        const overflow = bounds.minOffsetX - this.targetOffset.x;
        this.targetOffset.x += overflow * this.rubberBandSpringBack;
      }
    }

    // Skip Y-axis rubber banding if vertical pan is locked
    if (!this.lockVerticalPan) {
      if (bounds.shouldCenterY) {
        const distanceY = bounds.centerY - this.targetOffset.y;
        this.targetOffset.y += distanceY * this.rubberBandSpringBack;
      } else {
        // Spring back if outside bounds
        if (this.targetOffset.y > bounds.maxOffsetY) {
          const overflow = this.targetOffset.y - bounds.maxOffsetY;
          this.targetOffset.y -= overflow * this.rubberBandSpringBack;
        } else if (this.targetOffset.y < bounds.minOffsetY) {
          const overflow = bounds.minOffsetY - this.targetOffset.y;
          this.targetOffset.y += overflow * this.rubberBandSpringBack;
        }
      }
    }
  }

  /**
   * Apply resistance when dragging outside bounds (iOS-style rubber band feel)
   */
  private applyDragResistance(dx: number, dy: number): { dx: number; dy: number } {
    if (!this.enableRubberBanding) return { dx, dy };

    const bounds = this.calculateBounds();
    if (!bounds) return { dx, dy };

    let resistedDx = dx;
    let resistedDy = dy;

    // Apply resistance when dragging outside bounds
    const newOffsetX = this.offsetStart.x + dx;
    const newOffsetY = this.offsetStart.y + dy;

    // X-axis resistance
    if (!bounds.shouldCenterX) {
      if (newOffsetX > bounds.maxOffsetX) {
        const overflow = newOffsetX - bounds.maxOffsetX;
        resistedDx = dx - overflow * this.rubberBandResistance;
      } else if (newOffsetX < bounds.minOffsetX) {
        const overflow = bounds.minOffsetX - newOffsetX;
        resistedDx = dx + overflow * this.rubberBandResistance;
      }
    }

    // Y-axis resistance (skip if vertical pan is locked)
    if (!this.lockVerticalPan && !bounds.shouldCenterY) {
      if (newOffsetY > bounds.maxOffsetY) {
        const overflow = newOffsetY - bounds.maxOffsetY;
        resistedDy = dy - overflow * this.rubberBandResistance;
      } else if (newOffsetY < bounds.minOffsetY) {
        const overflow = bounds.minOffsetY - newOffsetY;
        resistedDy = dy + overflow * this.rubberBandResistance;
      }
    } else if (this.lockVerticalPan) {
      // Block vertical dragging completely
      resistedDy = 0;
    }

    return { dx: resistedDx, dy: resistedDy };
  }

  private setupEventListeners() {
    // Mouse wheel zoom
    this.canvas.addEventListener('wheel', this.handleWheel, { passive: false });
    
    // Pan with mouse drag
    this.canvas.addEventListener('mousedown', this.handleMouseDown);
    this.canvas.addEventListener('mousemove', this.handleMouseMove);
    this.canvas.addEventListener('mouseup', this.handleMouseUp);
    this.canvas.addEventListener('mouseleave', this.handleMouseUp);
    
    // Touch support (passive: false to enable preventDefault for iOS)
    this.canvas.addEventListener('touchstart', this.handleTouchStart, { passive: false });
    this.canvas.addEventListener('touchmove', this.handleTouchMove, { passive: false });
    this.canvas.addEventListener('touchend', this.handleTouchEnd);
    this.canvas.addEventListener('touchcancel', this.handleTouchEnd); // Handle interrupted touches
  }
  
  destroy() {
    this.canvas.removeEventListener('wheel', this.handleWheel);
    this.canvas.removeEventListener('mousedown', this.handleMouseDown);
    this.canvas.removeEventListener('mousemove', this.handleMouseMove);
    this.canvas.removeEventListener('mouseup', this.handleMouseUp);
    this.canvas.removeEventListener('mouseleave', this.handleMouseUp);
    this.canvas.removeEventListener('touchstart', this.handleTouchStart);
    this.canvas.removeEventListener('touchmove', this.handleTouchMove);
    this.canvas.removeEventListener('touchend', this.handleTouchEnd);
    this.canvas.removeEventListener('touchcancel', this.handleTouchEnd);
  }
  
  private handleWheel = (e: WheelEvent) => {
    e.preventDefault();

    // Increased zoom speed for better control (0.002 instead of 0.001)
    const delta = -e.deltaY * 0.002;
    const newScale = Math.max(this.minScale, Math.min(this.maxScale, this.targetScale * (1 + delta)));

    // Zoom towards mouse position
    const rect = this.canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Adjust target offset to zoom towards mouse position
    const scaleFactor = newScale / this.targetScale;
    this.targetOffset.x = mouseX - (mouseX - this.targetOffset.x) * scaleFactor;
    this.targetOffset.y = mouseY - (mouseY - this.targetOffset.y) * scaleFactor;

    this.targetScale = newScale;
  };
  
  private handleMouseDown = (e: MouseEvent) => {
    // Only pan with middle or right button, or with Ctrl/Cmd key
    if (e.button === 1 || e.button === 2 || e.ctrlKey || e.metaKey) {
      e.preventDefault();
      this.isDragging = true;
      this.dragStart.x = e.clientX;
      this.dragStart.y = e.clientY;
      this.offsetStart.x = this.targetOffset.x;
      this.offsetStart.y = this.targetOffset.y;
      this.canvas.style.cursor = 'grabbing';
    }
  };

  private handleMouseMove = (e: MouseEvent) => {
    if (this.isDragging) {
      const dx = e.clientX - this.dragStart.x;
      const dy = e.clientY - this.dragStart.y;

      // Apply rubber band resistance when dragging outside bounds
      const resisted = this.applyDragResistance(dx, dy);

      this.targetOffset.x = this.offsetStart.x + resisted.dx;
      this.targetOffset.y = this.offsetStart.y + resisted.dy;
    }
  };
  
  private handleMouseUp = () => {
    if (this.isDragging) {
      this.isDragging = false;
      this.canvas.style.cursor = 'default';
    }
  };
  
  // Touch support
  private touchStartDistance = 0;
  private touchStartScale = 1;
  private touchStartCenter = new Vector2(0, 0); // Midpoint between two fingers

  private handleTouchStart = (e: TouchEvent) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      this.touchStartDistance = Math.hypot(
        touch2.clientX - touch1.clientX,
        touch2.clientY - touch1.clientY
      );
      this.touchStartScale = this.targetScale;

      // Store midpoint between fingers (relative to canvas)
      const rect = this.canvas.getBoundingClientRect();
      this.touchStartCenter.x = ((touch1.clientX + touch2.clientX) / 2) - rect.left;
      this.touchStartCenter.y = ((touch1.clientY + touch2.clientY) / 2) - rect.top;
    } else if (e.touches.length === 1) {
      // Prevent default to avoid iOS Safari scroll/bounce behavior
      e.preventDefault();
      const touch = e.touches[0];
      this.isDragging = true;
      this.dragStart.x = touch.clientX;
      this.dragStart.y = touch.clientY;
      this.offsetStart.x = this.targetOffset.x;
      this.offsetStart.y = this.targetOffset.y;
    }
  };

  private handleTouchMove = (e: TouchEvent) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      const distance = Math.hypot(
        touch2.clientX - touch1.clientX,
        touch2.clientY - touch1.clientY
      );
      const scaleFactor = distance / this.touchStartDistance;
      const newScale = Math.max(this.minScale, Math.min(this.maxScale, this.touchStartScale * scaleFactor));

      // Zoom towards the midpoint between fingers (iOS-style pinch-to-zoom)
      const scaleRatio = newScale / this.targetScale;
      this.targetOffset.x = this.touchStartCenter.x - (this.touchStartCenter.x - this.targetOffset.x) * scaleRatio;
      this.targetOffset.y = this.touchStartCenter.y - (this.touchStartCenter.y - this.targetOffset.y) * scaleRatio;

      this.targetScale = newScale;
    } else if (e.touches.length === 1 && this.isDragging) {
      e.preventDefault();
      const touch = e.touches[0];
      const dx = touch.clientX - this.dragStart.x;
      const dy = touch.clientY - this.dragStart.y;

      // Apply rubber band resistance when dragging outside bounds
      const resisted = this.applyDragResistance(dx, dy);

      this.targetOffset.x = this.offsetStart.x + resisted.dx;
      this.targetOffset.y = this.offsetStart.y + resisted.dy;
    }
  };
  
  private handleTouchEnd = () => {
    this.isDragging = false;
    this.touchStartDistance = 0;
  };
  
  /**
   * Reset to fit-to-content view
   * Calculates correct offset based on content bounds and viewport size
   * If content is smaller than viewport, center it immediately (no rubberband animation)
   */
  reset() {
    this.targetScale = this.fitToContentScale;

    let offsetX = 0;
    let offsetY = 0;

    if (this.contentBounds) {
      const scaledWidth = this.contentBounds.width * this.fitToContentScale;
      const scaledHeight = this.contentBounds.height * this.fitToContentScale;

      // Check if content is smaller than viewport (would be centered by rubberband)
      const shouldCenterX = scaledWidth < this.viewportWidth;
      const shouldCenterY = scaledHeight < this.viewportHeight;

      if (shouldCenterX) {
        // Center horizontally immediately
        offsetX = (this.viewportWidth - scaledWidth) / 2 - this.contentBounds.minX * this.fitToContentScale;
      } else {
        // Align to left edge
        offsetX = -this.contentBounds.minX * this.fitToContentScale;
      }

      if (shouldCenterY) {
        // Center vertically immediately
        offsetY = (this.viewportHeight - scaledHeight) / 2 - this.contentBounds.minY * this.fitToContentScale;
      } else {
        // Align to top edge
        offsetY = -this.contentBounds.minY * this.fitToContentScale;
      }
    }

    this.targetOffset.x = offsetX;
    this.targetOffset.y = offsetY;

    // Also reset current values for instant reset (no interpolation/animation)
    this.scale = this.fitToContentScale;
    this.offset.x = offsetX;
    this.offset.y = offsetY;
  }

  /**
   * Smoothly center viewport on a specific world position
   * Used in Hero Mode to center clicked products
   *
   * @param worldX - X coordinate in world space (e.g., product center)
   * @param worldY - Y coordinate in world space (e.g., product center)
   * @param targetScale - Optional scale to animate to (defaults to current scale)
   */
  centerOn(worldX: number, worldY: number, targetScale?: number): void {
    // Use provided scale or keep current
    const scale = targetScale ?? this.targetScale;

    // Calculate offset needed to center world position in viewport
    // Formula: offset = viewportCenter - (worldPos * scale)
    const offsetX = this.viewportWidth / 2 - worldX * scale;
    const offsetY = this.viewportHeight / 2 - worldY * scale;

    // Set targets (smooth interpolation will handle the animation)
    this.targetScale = scale;
    this.targetOffset.x = offsetX;
    this.targetOffset.y = offsetY;
  }

  /**
   * Immediately set scale and offset without interpolation
   */
  setImmediate(scale: number, offsetX: number, offsetY: number) {
    this.scale = scale;
    this.targetScale = scale;
    this.offset.x = offsetX;
    this.offset.y = offsetY;
    this.targetOffset.x = offsetX;
    this.targetOffset.y = offsetY;
  }
  
  applyTransform(ctx: CanvasRenderingContext2D) {
    ctx.translate(this.offset.x, this.offset.y);
    ctx.scale(this.scale, this.scale);
  }
  
  screenToWorld(screenX: number, screenY: number): Vector2 {
    return new Vector2(
      (screenX - this.offset.x) / this.scale,
      (screenY - this.offset.y) / this.scale
    );
  }
}

