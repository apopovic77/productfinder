import { Vector2 } from 'arkturian-typescript-utils';

export class ViewportTransform {
  public scale = 1;
  public offset = new Vector2(0, 0);
  public minScale = 0.1;
  public maxScale = 10; // Allow 10x zoom for quality inspection
  
  private isDragging = false;
  private dragStart = new Vector2(0, 0);
  private offsetStart = new Vector2(0, 0);
  
  constructor(private canvas: HTMLCanvasElement) {
    this.setupEventListeners();
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
    const newScale = Math.max(this.minScale, Math.min(this.maxScale, this.scale * (1 + delta)));
    
    // Zoom towards mouse position
    const rect = this.canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    // Adjust offset to zoom towards mouse
    const scaleFactor = newScale / this.scale;
    this.offset.x = mouseX - (mouseX - this.offset.x) * scaleFactor;
    this.offset.y = mouseY - (mouseY - this.offset.y) * scaleFactor;
    
    this.scale = newScale;
  };
  
  private handleMouseDown = (e: MouseEvent) => {
    // Only pan with middle or right button, or with Ctrl/Cmd key
    if (e.button === 1 || e.button === 2 || e.ctrlKey || e.metaKey) {
      e.preventDefault();
      this.isDragging = true;
      this.dragStart.x = e.clientX;
      this.dragStart.y = e.clientY;
      this.offsetStart.x = this.offset.x;
      this.offsetStart.y = this.offset.y;
      this.canvas.style.cursor = 'grabbing';
    }
  };
  
  private handleMouseMove = (e: MouseEvent) => {
    if (this.isDragging) {
      const dx = e.clientX - this.dragStart.x;
      const dy = e.clientY - this.dragStart.y;
      this.offset.x = this.offsetStart.x + dx;
      this.offset.y = this.offsetStart.y + dy;
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
      this.touchStartScale = this.scale;
    } else if (e.touches.length === 1) {
      const touch = e.touches[0];
      this.isDragging = true;
      this.dragStart.x = touch.clientX;
      this.dragStart.y = touch.clientY;
      this.offsetStart.x = this.offset.x;
      this.offsetStart.y = this.offset.y;
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
      this.scale = Math.max(this.minScale, Math.min(this.maxScale, this.touchStartScale * scaleFactor));
    } else if (e.touches.length === 1 && this.isDragging) {
      const touch = e.touches[0];
      const dx = touch.clientX - this.dragStart.x;
      const dy = touch.clientY - this.dragStart.y;
      this.offset.x = this.offsetStart.x + dx;
      this.offset.y = this.offsetStart.y + dy;
    }
  };
  
  private handleTouchEnd = () => {
    this.isDragging = false;
    this.touchStartDistance = 0;
  };
  
  reset() {
    this.scale = 1;
    this.offset.x = 0;
    this.offset.y = 0;
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

