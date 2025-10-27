import { ImageCache } from '../utils/ImageCache';
import { LayoutNode } from '../layout/LayoutNode';
import type { Product } from '../types/Product';

export class CanvasRenderer<T> {
  private rafId: number | null = null;
  private cache = new ImageCache();
  public hoveredItem: T | null = null;
  
  constructor(
    private ctx: CanvasRenderingContext2D, 
    private getNodes: () => LayoutNode<T>[], 
    private renderAccessors: { label(item: T): string; imageUrl(item: T): string; priceText(item: T): string }
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
    const nodes = this.getNodes();
    
    for (const n of nodes) {
      const x = n.posX.value ?? 0, y = n.posY.value ?? 0, w = n.width.value ?? 0, h = n.height.value ?? 0;
      const url = this.renderAccessors.imageUrl(n.data as any);
      const img = await this.cache.load(url);
      const isHovered = this.hoveredItem === n.data;
      
      // Draw hover highlight
      if (isHovered) {
        this.ctx.save();
        this.ctx.shadowColor = 'rgba(67, 56, 202, 0.5)';
        this.ctx.shadowBlur = 20;
        this.ctx.fillStyle = 'rgba(67, 56, 202, 0.1)';
        this.ctx.fillRect(x - 4, y - 4, w + 8, h + 8);
        this.ctx.restore();
      }
      
      this.ctx.globalAlpha = n.opacity.value ?? 1;
      this.ctx.drawImage(img, x, y, w, h);
      this.ctx.globalAlpha = 1;
      
      // Border on hover
      if (isHovered) {
        this.ctx.strokeStyle = '#4338ca';
        this.ctx.lineWidth = 3;
        this.ctx.strokeRect(x, y, w, h);
      }
      
      // label and price
      this.ctx.fillStyle = isHovered ? '#4338ca' : '#111'; 
      this.ctx.font = isHovered ? 'bold 12px system-ui' : '12px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
      this.ctx.fillText(this.renderAccessors.label(n.data as any), x, y - 4);
      const price = this.renderAccessors.priceText(n.data as any);
      if (price) this.ctx.fillText(price, x, y + h + 14);
    }
  }
}



