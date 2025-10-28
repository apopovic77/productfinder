import { Vector2 } from 'arkturian-typescript-utils';

export interface ContentBounds {
  width: number;
  height: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
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
  public maxScale = 10; // Allow 10x zoom for quality inspection

  // Content bounds for bounds checking
  private contentBounds: ContentBounds | null = null;
  private viewportWidth = 0;
  private viewportHeight = 0;

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
   * Calculate the scale needed to fit all content in viewport
   */
  private calculateFitToContentScale(): void {
    if (!this.contentBounds || this.viewportWidth === 0 || this.viewportHeight === 0) {
      this.fitToContentScale = 1;
      return;
    }

    const scaleX = this.viewportWidth / this.contentBounds.width;
    const scaleY = this.viewportHeight / this.contentBounds.height;

    // Use the smaller scale to ensure everything fits
    this.fitToContentScale = Math.min(scaleX, scaleY) * 0.95; // 95% to add some padding
  }

  /**
   * Get minimum allowed scale (can't zoom out further than fit-to-content)
   */
  get minScale(): number {
    return Math.min(0.1, this.fitToContentScale);
  }

  /**
   * Smooth interpolation update - call this every frame!
   * Formula: curr += (target - curr) * speedFactor
   */
  update(): void {
    // Interpolate scale
    this.scale += (this.targetScale - this.scale) * this.speedFactor;

    // Interpolate offset
    this.offset.x += (this.targetOffset.x - this.offset.x) * this.speedFactor;
    this.offset.y += (this.targetOffset.y - this.offset.y) * this.speedFactor;

    // Apply bounds checking to target offset
    this.applyBoundsToTarget();
  }

  /**
   * Apply bounds checking to prevent panning outside content
   */
  private applyBoundsToTarget(): void {
    if (!this.contentBounds) return;

    const scaledWidth = this.contentBounds.width * this.targetScale;
    const scaledHeight = this.contentBounds.height * this.targetScale;

    // Calculate world space bounds
    const worldMinX = this.contentBounds.minX * this.targetScale;
    const worldMinY = this.contentBounds.minY * this.targetScale;
    const worldMaxX = this.contentBounds.maxX * this.targetScale;
    const worldMaxY = this.contentBounds.maxY * this.targetScale;

    // Prevent panning too far right (content left edge can't go past right edge of viewport)
    const maxOffsetX = this.viewportWidth;
    // Prevent panning too far left (content right edge can't go past left edge of viewport)
    const minOffsetX = this.viewportWidth - scaledWidth;

    // Prevent panning too far down (content top edge can't go past bottom of viewport)
    const maxOffsetY = this.viewportHeight;
    // Prevent panning too far up (content bottom edge can't go past top of viewport)
    const minOffsetY = this.viewportHeight - scaledHeight;

    // If content is smaller than viewport, center it
    if (scaledWidth < this.viewportWidth) {
      this.targetOffset.x = (this.viewportWidth - scaledWidth) / 2;
    } else {
      this.targetOffset.x = Math.max(minOffsetX, Math.min(maxOffsetX, this.targetOffset.x));
    }

    if (scaledHeight < this.viewportHeight) {
      this.targetOffset.y = (this.viewportHeight - scaledHeight) / 2;
    } else {
      this.targetOffset.y = Math.max(minOffsetY, Math.min(maxOffsetY, this.targetOffset.y));
    }
  }

  private setupEventListeners() {
    // Mouse wheel zoom
    this.canvas.addEventListener('wheel', this.handleWheel, { passive: false });
    
    // Pan with mouse drag
    this.canvas.addEventListener('mousedown', this.handleMouseDown);
    this.canvas.addEventListener('mousemove', this.handleMouseMove);
    this.canvas.addEventListener('mouseup', this.handleMouseUp);
    this.canvas.addEventListener('mouseleave', this.handleMouseUp);
    
    // Touch support
    this.canvas.addEventListener('touchstart', this.handleTouchStart, { passive: false });
    this.canvas.addEventListener('touchmove', this.handleTouchMove, { passive: false });
    this.canvas.addEventListener('touchend', this.handleTouchEnd);
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
      this.targetOffset.x = this.offsetStart.x + dx;
      this.targetOffset.y = this.offsetStart.y + dy;
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
    } else if (e.touches.length === 1) {
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
      this.targetScale = Math.max(this.minScale, Math.min(this.maxScale, this.touchStartScale * scaleFactor));
    } else if (e.touches.length === 1 && this.isDragging) {
      const touch = e.touches[0];
      const dx = touch.clientX - this.dragStart.x;
      const dy = touch.clientY - this.dragStart.y;
      this.targetOffset.x = this.offsetStart.x + dx;
      this.targetOffset.y = this.offsetStart.y + dy;
    }
  };
  
  private handleTouchEnd = () => {
    this.isDragging = false;
    this.touchStartDistance = 0;
  };
  
  /**
   * Reset to fit-to-content view
   */
  reset() {
    this.targetScale = this.fitToContentScale;
    this.targetOffset.x = 0;
    this.targetOffset.y = 0;

    // Also reset current values for instant reset
    this.scale = this.fitToContentScale;
    this.offset.x = 0;
    this.offset.y = 0;
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

