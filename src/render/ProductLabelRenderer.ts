/**
 * ProductLabelRenderer — renders product info labels on the canvas.
 * Flexible, configurable, only renders for visible products.
 */

export type LabelField = 'name' | 'category' | 'price' | 'color' | 'year' | 'sku';

export type LabelConfig = {
  enabled: boolean;
  fields: LabelField[];
  position: 'below' | 'above' | 'overlay-bottom';
  fontFamily: string;
  maxWidth: number; // relative to product width (0-1)
  nameSize: number; // relative to product width
  detailSize: number;
  nameColor: string;
  detailColor: string;
  priceColor: string;
  gap: number; // px between lines
  backgroundEnabled: boolean;
  backgroundColor: string;
  backgroundPadding: number;
  backgroundRadius: number;
};

const DEFAULT_CONFIG: LabelConfig = {
  enabled: true,
  fields: ['name', 'price'],
  position: 'below',
  fontFamily: '-apple-system, "Segoe UI", sans-serif',
  maxWidth: 1.0,
  nameSize: 0.065,
  detailSize: 0.05,
  nameColor: 'rgba(0, 0, 0, 0.85)',
  detailColor: 'rgba(0, 0, 0, 0.5)',
  priceColor: '#ff6b00',
  gap: 3,
  backgroundEnabled: false,
  backgroundColor: 'rgba(255, 255, 255, 0.85)',
  backgroundPadding: 6,
  backgroundRadius: 6,
};

export class ProductLabelRenderer {
  private config: LabelConfig;

  constructor(config: Partial<LabelConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  get enabled(): boolean { return this.config.enabled; }
  set enabled(v: boolean) { this.config.enabled = v; }

  update(config: Partial<LabelConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Render labels for a product. Only call for visible products.
   * @param ctx Canvas context (already in world-space with viewport transform)
   * @param product The product data
   * @param x Product x position
   * @param y Product y position
   * @param w Product width
   * @param h Product height
   * @param scale Current viewport scale (for visibility culling)
   */
  render(
    ctx: CanvasRenderingContext2D,
    product: any,
    x: number, y: number, w: number, h: number,
    scale: number
  ): void {
    if (!this.config.enabled) return;

    // Skip if product is too small on screen
    const screenH = h * scale;
    if (screenH < 40) return;

    const raw = product.raw || {};
    const fields = this.config.fields;
    const maxTextWidth = w * this.config.maxWidth;
    const nameSize = Math.max(8, Math.min(18, w * this.config.nameSize));
    const detailSize = Math.max(7, Math.min(14, w * this.config.detailSize));
    const gap = this.config.gap;
    const font = this.config.fontFamily;

    // Collect lines to render
    const lines: Array<{ text: string; font: string; color: string }> = [];

    for (const field of fields) {
      switch (field) {
        case 'name': {
          let name = (product.name || '').toUpperCase().replace(/O'NEAL\s*/gi, '').trim();
          if (name) lines.push({ text: name, font: `600 ${nameSize}px ${font}`, color: this.config.nameColor });
          break;
        }
        case 'category': {
          const cat = raw.properties?.product_type || raw.category || '';
          if (cat) lines.push({ text: cat, font: `400 ${detailSize}px ${font}`, color: this.config.detailColor });
          break;
        }
        case 'price': {
          const price = raw.price_from;
          if (typeof price === 'number' && price > 0) {
            lines.push({ text: `${price.toFixed(2)} EUR`, font: `700 ${detailSize}px ${font}`, color: this.config.priceColor });
          }
          break;
        }
        case 'color': {
          const color = raw.color_name;
          if (color) lines.push({ text: color, font: `400 ${detailSize}px ${font}`, color: this.config.detailColor });
          break;
        }
        case 'year': {
          const year = raw.model_year;
          if (year) lines.push({ text: String(year), font: `400 ${detailSize}px ${font}`, color: this.config.detailColor });
          break;
        }
        case 'sku': {
          const sku = product.sku || raw.product_code;
          if (sku) lines.push({ text: sku, font: `400 ${detailSize}px ${font}`, color: this.config.detailColor });
          break;
        }
      }
    }

    if (!lines.length) return;

    const centerX = x + w / 2;

    // Calculate total height
    const totalHeight = lines.reduce((sum, _, i) => sum + detailSize + (i > 0 ? gap : 0), 0);

    // Position
    let startY: number;
    if (this.config.position === 'above') {
      startY = y - totalHeight - gap * 2;
    } else if (this.config.position === 'overlay-bottom') {
      startY = y + h - totalHeight - this.config.backgroundPadding * 2;
    } else {
      startY = y + h + gap * 2;
    }

    ctx.save();
    ctx.textAlign = 'center';

    // Background
    if (this.config.backgroundEnabled) {
      const bgPad = this.config.backgroundPadding;
      const bgW = Math.min(maxTextWidth + bgPad * 2, w);
      const bgH = totalHeight + bgPad * 2;
      const bgX = centerX - bgW / 2;
      const bgY = startY - bgPad;

      ctx.fillStyle = this.config.backgroundColor;
      ctx.beginPath();
      const r = this.config.backgroundRadius;
      ctx.moveTo(bgX + r, bgY);
      ctx.lineTo(bgX + bgW - r, bgY);
      ctx.quadraticCurveTo(bgX + bgW, bgY, bgX + bgW, bgY + r);
      ctx.lineTo(bgX + bgW, bgY + bgH - r);
      ctx.quadraticCurveTo(bgX + bgW, bgY + bgH, bgX + bgW - r, bgY + bgH);
      ctx.lineTo(bgX + r, bgY + bgH);
      ctx.quadraticCurveTo(bgX, bgY + bgH, bgX, bgY + bgH - r);
      ctx.lineTo(bgX, bgY + r);
      ctx.quadraticCurveTo(bgX, bgY, bgX + r, bgY);
      ctx.closePath();
      ctx.fill();
    }

    // Render lines
    let lineY = startY;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      ctx.font = line.font;
      ctx.fillStyle = line.color;
      ctx.textBaseline = 'top';

      // Truncate
      let text = line.text;
      while (ctx.measureText(text).width > maxTextWidth && text.length > 3) {
        text = text.slice(0, -2) + '…';
      }
      ctx.fillText(text, centerX, lineY, maxTextWidth);
      lineY += detailSize + gap;
    }

    ctx.restore();
  }
}
