export class SkeletonRenderer {
  private startTime = performance.now();
  
  constructor(private ctx: CanvasRenderingContext2D) {}
  
  draw(itemCount: number = 20) {
    const c = this.ctx.canvas;
    
    // Clear canvas
    this.ctx.clearRect(0, 0, c.width, c.height);
    this.ctx.fillStyle = '#fff';
    this.ctx.fillRect(0, 0, c.width, c.height);
    
    // Calculate grid layout
    const padding = 20;
    const gap = 20;
    const itemWidth = 180;
    const itemHeight = 220;
    const cols = Math.floor((c.width - padding * 2 + gap) / (itemWidth + gap));
    const rows = Math.ceil(itemCount / cols);
    
    // Pulse animation
    const elapsed = (performance.now() - this.startTime) / 1000;
    const pulse = 0.7 + 0.3 * Math.sin(elapsed * 2);
    
    for (let i = 0; i < itemCount; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = padding + col * (itemWidth + gap);
      const y = padding + row * (itemHeight + gap);
      
      // Draw skeleton item
      this.drawSkeletonItem(x, y, itemWidth, itemHeight, pulse);
    }
  }
  
  private drawSkeletonItem(x: number, y: number, w: number, h: number, pulse: number) {
    const baseColor = 220;
    const color = Math.floor(baseColor + (255 - baseColor) * pulse);
    
    // Image placeholder
    const imgHeight = h - 50;
    this.ctx.fillStyle = `rgb(${color}, ${color}, ${color})`;
    this.ctx.fillRect(x, y, w, imgHeight);
    
    // Title placeholder
    this.ctx.fillStyle = `rgb(${color}, ${color}, ${color})`;
    this.ctx.fillRect(x, y + imgHeight + 8, w * 0.8, 12);
    
    // Price placeholder
    this.ctx.fillStyle = `rgb(${color}, ${color}, ${color})`;
    this.ctx.fillRect(x, y + imgHeight + 28, w * 0.4, 10);
  }
}

