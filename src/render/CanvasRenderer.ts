import { LayoutNode } from '../layout/LayoutNode';
import { ViewportTransform } from '../utils/ViewportTransform';
import type { Product } from '../types/Product';
import type { GroupHeaderInfo } from '../layout/PivotLayouter';

export class CanvasRenderer<T> {
  private rafId: number | null = null;
  public hoveredItem: T | null = null;
  public focusedItem: T | null = null;
  public hoveredGroupKey: string | null = null;
  
  constructor(
    private ctx: CanvasRenderingContext2D, 
    private getNodes: () => LayoutNode<T>[], 
    private renderAccessors: { label(item: T): string; priceText(item: T): string },
    private viewport: ViewportTransform | null = null,
    private getGroupHeaders: () => GroupHeaderInfo[] = () => []
  ) {}
  
  start() { 
    this.stop(); 
    const loop = () => { 
      this.draw(); 
      this.rafId = requestAnimationFrame(loop); 
    }; 
    this.rafId = requestAnimationFrame(loop); 
  }
  
  stop() { 
    if (this.rafId) cancelAnimationFrame(this.rafId); 
    this.rafId = null; 
  }
  
  private clear() { 
    const c = this.ctx.canvas; 
    this.ctx.clearRect(0,0,c.width,c.height); 
    this.ctx.fillStyle = '#fff'; 
    this.ctx.fillRect(0,0,c.width,c.height); 
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
    
    for (const n of nodes) {
      const x = n.posX.value ?? 0, y = n.posY.value ?? 0;
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
        continue;
      }
      
      const img = product.image;
      if (!img) continue;
      
      const isFocused = this.focusedItem === n.data;
      
      // Apply scale transform
      this.ctx.save();
      const centerX = x + w / 2;
      const centerY = y + h / 2;
      this.ctx.translate(centerX, centerY);
      this.ctx.scale(scale, scale);
      this.ctx.translate(-centerX, -centerY);
      
      // Draw image (no hover effects - tooltip is enough!)
      this.ctx.globalAlpha = opacity;
      this.ctx.drawImage(img, x, y, w, h);
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
    
    // Draw group headers (after products, so they're on top)
    const groupHeaders = this.getGroupHeaders();
    for (const header of groupHeaders) {
      const isHovered = this.hoveredGroupKey === header.key;
      
      // Draw background
      this.ctx.fillStyle = isHovered 
        ? 'rgba(67, 56, 202, 0.1)' 
        : 'rgba(255, 255, 255, 0.95)';
      this.ctx.fillRect(header.x, header.y, header.width, header.height);
      
      // Draw border
      this.ctx.strokeStyle = isHovered ? '#4338ca' : '#e5e7eb';
      this.ctx.lineWidth = isHovered ? 2 : 1;
      this.ctx.strokeRect(header.x, header.y, header.width, header.height);
      
      // Draw text
      this.ctx.fillStyle = isHovered ? '#4338ca' : '#1f2937';
      this.ctx.font = isHovered ? 'bold 16px system-ui' : '14px system-ui';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText(
        header.label, 
        header.x + header.width / 2, 
        header.y + header.height / 2
      );
      
      // Draw click hint on hover
      if (isHovered) {
        this.ctx.font = '11px system-ui';
        this.ctx.fillStyle = '#9ca3af';
        this.ctx.fillText(
          'Click to drill down', 
          header.x + header.width / 2, 
          header.y + header.height / 2 + 12
        );
      }
    }
    
    // Restore viewport transform
    this.ctx.restore();
  }
}



