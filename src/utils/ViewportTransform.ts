// deep imports: the package barrel re-exports three-dependent types (Vector3/Color)
import { Vector2 } from 'arkturian-typescript-utils/dist/types/Vector2';

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

  // Interpolation speed (0-1, higher = faster)
  public speedFactor = 0.15;

  // Scale limits
  private fitToContentScale = 1; // Calculated from content bounds
  public maxScale = 2; // Dynamically calculated: fitToContentScale × 2
  public minScaleOverride: number | null = null;
  public panWithLeftButton = false;
  public ignoreBounds = false;  // Debug: disable all bounds clamping

  // Rubber banding config (iOS-style)
  private enableRubberBanding = true;
  private rubberBandResistance = 0.5; // 0-1, how much resistance (higher = more resistance)
  private rubberBandSpringBack = 0.08; // Speed of spring back (higher = faster)
  private lockVerticalPan = false; // If true, disable vertical panning and rubber banding
  private lockHorizontalPan = false; // If true, disable horizontal panning (phone leaf grid: up/down only)

  // Momentum / inertia
  private velocityX = 0;
  private velocityY = 0;
  private lastDragX = 0;
  private lastDragY = 0;
  private lastDragTime = 0;
  private momentumFriction = 0.95; // 0-1, higher = less friction, longer slide

  // Content bounds for bounds checking
  private contentBounds: ContentBounds | null = null;
  public viewportWidth = 0;
  public viewportHeight = 0;

  private isDragging = false;
  private dragStart = new Vector2(0, 0);
  private offsetStart = new Vector2(0, 0);
  
  constructor(private canvas: HTMLCanvasElement) {
    this.viewportWidth = canvas.clientWidth;
    this.viewportHeight = canvas.clientHeight;
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
    this.viewportWidth = this.canvas.clientWidth;
    this.viewportHeight = this.canvas.clientHeight;
    this.calculateFitToContentScale();
  }

  /**
   * Lock vertical panning (horizontal-only scrolling)
   */
  setLockHorizontalPan(lock: boolean): void {
    this.lockHorizontalPan = lock;
  }

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
    if (this.minScaleOverride !== null) return this.minScaleOverride;
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
    if (this.ignoreBounds) return null;  // Free pan mode

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
    if (this.lockHorizontalPan) {
      // No sideways drift at all: pin X to its clamped position.
      const target = bounds.shouldCenterX
        ? bounds.centerX
        : Math.min(bounds.maxOffsetX, Math.max(bounds.minOffsetX, this.targetOffset.x));
      this.targetOffset.x = target;
      this.velocityX = 0;
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

    // X-axis resistance (skip if horizontal pan is locked)
    if (this.lockHorizontalPan) {
      resistedDx = 0;
    } else if (!bounds.shouldCenterX) {
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
  
  private isPotentialDrag = false; // mousedown happened, waiting for movement
  private dragThreshold = 4; // pixels before drag starts
  private wasDragging = false; // true after a drag ended, consumed by next click
  private wasDraggingTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Arm the click-suppression after a drag. Browsers fire no click after a
   * moved touch, so without an expiry the flag survived the swipe and
   * swallowed the NEXT real tap (phone: first tap after a swipe did nothing).
   */
  private armDragSuppression(): void {
    this.wasDragging = true;
    if (this.wasDraggingTimer) clearTimeout(this.wasDraggingTimer);
    this.wasDraggingTimer = setTimeout(() => { this.wasDragging = false; this.wasDraggingTimer = null; }, 500);
  }

  private handleMouseDown = (e: MouseEvent) => {
    const canPan = e.button === 1 || e.button === 2 || e.ctrlKey || e.metaKey || (this.panWithLeftButton && e.button === 0);
    if (canPan) {
      // For middle/right button, start drag immediately
      // For left button, wait for movement threshold
      if (e.button !== 0) e.preventDefault();
      this.isPotentialDrag = true;
      this.isDragging = false;
      this.dragStart.x = e.clientX;
      this.dragStart.y = e.clientY;
      this.offsetStart.x = this.targetOffset.x;
      this.offsetStart.y = this.targetOffset.y;
    }
  };

  private handleMouseMove = (e: MouseEvent) => {
    if (this.isPotentialDrag && !this.isDragging) {
      const dx = Math.abs(e.clientX - this.dragStart.x);
      const dy = Math.abs(e.clientY - this.dragStart.y);
      if (dx > this.dragThreshold || dy > this.dragThreshold) {
        this.isDragging = true;
        this.canvas.style.cursor = 'grabbing';
      }
    }
    if (this.isDragging) {
      const now = performance.now();
      const dt = Math.max(1, now - this.lastDragTime);
      this.velocityX = (e.clientX - this.lastDragX) / dt * 16; // normalize to ~60fps
      this.velocityY = (e.clientY - this.lastDragY) / dt * 16;
      this.lastDragX = e.clientX;
      this.lastDragY = e.clientY;
      this.lastDragTime = now;

      const dx = e.clientX - this.dragStart.x;
      const dy = e.clientY - this.dragStart.y;
      const resisted = this.applyDragResistance(dx, dy);
      this.targetOffset.x = this.offsetStart.x + resisted.dx;
      this.targetOffset.y = this.offsetStart.y + resisted.dy;
    }
  };

  private handleMouseUp = () => {
    this.isPotentialDrag = false;
    if (this.isDragging) {
      this.armDragSuppression();
      this.isDragging = false;
      this.canvas.style.cursor = 'default';
      // Apply momentum
      this.applyMomentum();
    }
  };

  /**
   * Snap hook for paged views (hero mode). Given the release velocity and the
   * world x currently at the viewport centre, returns the world x to settle
   * on — or null to leave the viewport where the finger left it. Set by the
   * controller while the hero layout is active, cleared otherwise.
   */
  public snapResolver: ((centerWorldX: number, velocityX: number) => number | null) | null = null;

  /** Vertical pendant (phone hero presentation): world y anchored at snapAnchorY. */
  public snapResolverY: ((centerWorldY: number, velocityY: number) => number | null) | null = null;
  public snapAnchorY: number | null = null;

  private applyMomentum(): void {
    // No artificial momentum — the interpolation decelerates on its own.
    // But a paged view must not stop BETWEEN pages: without a snap the
    // viewport came to rest wherever the finger lifted, half-way between
    // two products, and every swipe needed a correction (owner report
    // 2026-08-23, storage 120441).
    if (this.snapResolverY) {
      const anchor = this.snapAnchorY ?? this.viewportHeight / 2;
      const centerWorldY = (anchor - this.targetOffset.y) / this.targetScale;
      const target = this.snapResolverY(centerWorldY, this.velocityY);
      if (target !== null) {
        this.targetOffset.y = anchor - target * this.targetScale;
      }
      this.velocityX = 0;
      this.velocityY = 0;
      return;
    }
    if (this.snapResolver) {
      const centerWorldX = (this.viewportWidth / 2 - this.targetOffset.x) / this.targetScale;
      const target = this.snapResolver(centerWorldX, this.velocityX);
      if (target !== null) {
        this.targetOffset.x = this.viewportWidth / 2 - target * this.targetScale;
      }
    } else {
      // Free-scrolling views: carry the release velocity into a glide.
      // Killing it dead made long lists feel like dragging a brick — every
      // screenful needed its own swipe (owner 2026-08-24, phone leaf grid).
      // The interpolation eases toward the projected point; the rubber
      // band still owns the edges.
      const GLIDE = 16;      // ≈ Σ 0.95^n of the per-frame velocity
      const MAX_GLIDE = 2400;
      const clampGlide = (v: number) => Math.max(-MAX_GLIDE, Math.min(MAX_GLIDE, v * GLIDE));
      if (!this.lockHorizontalPan && Math.abs(this.velocityX) > 2) {
        this.targetOffset.x += clampGlide(this.velocityX);
      }
      if (!this.lockVerticalPan && Math.abs(this.velocityY) > 2) {
        this.targetOffset.y += clampGlide(this.velocityY);
      }
    }
    this.velocityX = 0;
    this.velocityY = 0;
  }

  /**
   * Returns true if a drag just ended. Call this from click handlers
   * to suppress click after pan. Resets the flag after reading.
   */
  public consumeDrag(): boolean {
    if (this.wasDragging) {
      this.wasDragging = false;
      return true;
    }
    return false;
  }
  
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
      e.preventDefault();
      const touch = e.touches[0];
      this.isPotentialDrag = true;
      this.isDragging = false;
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

      const scaleRatio = newScale / this.targetScale;
      this.targetOffset.x = this.touchStartCenter.x - (this.touchStartCenter.x - this.targetOffset.x) * scaleRatio;
      this.targetOffset.y = this.touchStartCenter.y - (this.touchStartCenter.y - this.targetOffset.y) * scaleRatio;

      this.targetScale = newScale;
    } else if (e.touches.length === 1 && this.isPotentialDrag) {
      const touch = e.touches[0];
      const dx = touch.clientX - this.dragStart.x;
      const dy = touch.clientY - this.dragStart.y;

      if (!this.isDragging) {
        if (Math.abs(dx) > this.dragThreshold || Math.abs(dy) > this.dragThreshold) {
          this.isDragging = true;
        } else {
          return;
        }
      }

      e.preventDefault();
      const now = performance.now();
      const dt = Math.max(1, now - this.lastDragTime);
      this.velocityX = (touch.clientX - this.lastDragX) / dt * 16;
      this.velocityY = (touch.clientY - this.lastDragY) / dt * 16;
      this.lastDragX = touch.clientX;
      this.lastDragY = touch.clientY;
      this.lastDragTime = now;

      const resisted = this.applyDragResistance(dx, dy);
      this.targetOffset.x = this.offsetStart.x + resisted.dx;
      this.targetOffset.y = this.offsetStart.y + resisted.dy;
    }
  };

  private handleTouchEnd = (e: TouchEvent) => {
    this.isPotentialDrag = false;
    if (this.isDragging) {
      this.armDragSuppression();
      this.isDragging = false;
      this.applyMomentum();
    }
    // Also suppress click after pinch-zoom
    if (this.touchStartDistance > 0) {
      this.armDragSuppression();
    }
    // Only reset pinch distance when all fingers are up
    if (e.touches.length === 0) {
      this.touchStartDistance = 0;
    }
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

    // Let interpolation handle the animation smoothly
    // (removed instant reset for continuous flow during mode switches)
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
   * Set target position (smooth interpolation)
   */
  setPosition(offsetX: number, offsetY: number, scale: number): void {
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

