import { ImageCache } from '../utils/ImageCache';
import { LayoutNode } from '../layout/LayoutNode';
import { ViewportTransform } from '../utils/ViewportTransform';
import type { Product } from '../types/Product';

export class CanvasRenderer<T> {
  private rafId: number | null = null;
  private cache = new ImageCache();
  public hoveredItem: T | null = null;
  public focusedItem: T | null = null;
  
  constructor(
    private ctx: CanvasRenderingContext2D, 
    private getNodes: () => LayoutNode<T>[], 
    private renderAccessors: { label(item: T): string; imageUrl(item: T): string; priceText(item: T): string },
    private viewport: ViewportTransform | null = null
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
      
      const url = this.renderAccessors.imageUrl(n.data as any);
      const img = await this.cache.load(url);
      const isHovered = this.hoveredItem === n.data;
      const isFocused = this.focusedItem === n.data;
      const isHighlighted = isHovered || isFocused;
      
      // Apply scale transform
      this.ctx.save();
      const centerX = x + w / 2;
      const centerY = y + h / 2;
      this.ctx.translate(centerX, centerY);
      this.ctx.scale(scale, scale);
      this.ctx.translate(-centerX, -centerY);
      
      // Draw highlight
      if (isHighlighted) {
        this.ctx.save();
        this.ctx.shadowColor = isFocused ? 'rgba(16, 185, 129, 0.5)' : 'rgba(67, 56, 202, 0.5)';
        this.ctx.shadowBlur = 20;
        this.ctx.fillStyle = isFocused ? 'rgba(16, 185, 129, 0.1)' : 'rgba(67, 56, 202, 0.1)';
        this.ctx.fillRect(x - 4, y - 4, w + 8, h + 8);
        this.ctx.restore();
      }
      
      this.ctx.globalAlpha = opacity;
      this.ctx.drawImage(img, x, y, w, h);
      this.ctx.globalAlpha = 1;
      
      // Border
      if (isHighlighted) {
        this.ctx.strokeStyle = isFocused ? '#10b981' : '#4338ca';
        this.ctx.lineWidth = isFocused ? 4 : 3;
        this.ctx.strokeRect(x, y, w, h);
        
        // Focus indicator (dashed outer border)
        if (isFocused) {
          this.ctx.setLineDash([8, 4]);
          this.ctx.strokeStyle = '#10b981';
          this.ctx.lineWidth = 2;
          this.ctx.strokeRect(x - 6, y - 6, w + 12, h + 12);
          this.ctx.setLineDash([]);
        }
      }
      
      // label and price
      this.ctx.fillStyle = isFocused ? '#10b981' : (isHovered ? '#4338ca' : '#111'); 
      this.ctx.font = isHighlighted ? 'bold 12px system-ui' : '12px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
      this.ctx.fillText(this.renderAccessors.label(n.data as any), x, y - 4);
      const price = this.renderAccessors.priceText(n.data as any);
      if (price) this.ctx.fillText(price, x, y + h + 14);
      
      // Restore item transform
      this.ctx.restore();
    }
    
    // Restore viewport transform
    this.ctx.restore();
  }
}



