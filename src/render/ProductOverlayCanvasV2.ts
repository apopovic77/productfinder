import type { Product } from '../types/Product';

// Storage API URL from environment
const STORAGE_API_URL = import.meta.env.VITE_STORAGE_API_URL || 'https://gsgbot.arkturian.com/storage-api';

/**
 * Modern Product Overlay Style (Blue gradient design)
 */
export interface OverlayV2Style {
  // Background colors
  panelBackground: string;
  panelBackdropBlur: number;

  // Text colors
  titleColor: string;
  priceColor: string;
  bodyTextColor: string;
  secondaryTextColor: string;

  // Feature colors
  featureIconColor: string;
  featureTitleColor: string;
  featureSubtitleColor: string;

  // Button colors
  primaryButtonGradientStart: string;
  primaryButtonGradientEnd: string;
  primaryButtonTextColor: string;

  // Dropdown colors
  dropdownBackground: string;
  dropdownBorder: string;
  dropdownTextColor: string;
}

/**
 * Modern blue gradient style matching the mockup
 */
export const MODERN_OVERLAY_STYLE: OverlayV2Style = {
  panelBackground: 'rgba(100, 150, 230, 0.95)',
  panelBackdropBlur: 20,

  titleColor: 'white',
  priceColor: 'white',
  bodyTextColor: 'rgba(255, 255, 255, 0.95)',
  secondaryTextColor: 'rgba(255, 255, 255, 0.8)',

  featureIconColor: 'rgba(255, 255, 255, 0.9)',
  featureTitleColor: 'white',
  featureSubtitleColor: 'rgba(255, 255, 255, 0.85)',

  primaryButtonGradientStart: '#2aa8ef',
  primaryButtonGradientEnd: '#12d4de',
  primaryButtonTextColor: 'white',

  dropdownBackground: 'rgba(255, 255, 255, 0.2)',
  dropdownBorder: 'rgba(255, 255, 255, 0.3)',
  dropdownTextColor: 'white',
};

interface Bounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface ParsedFeature {
  title: string;
  subtitle: string;
  icon: string; // Icon identifier
}

export type OverlayClickResult = 'close' | 'add-to-cart' | 'view-website' | 'background' | null;

/**
 * Modern Product Overlay V2 - Blue gradient design with features
 * Renders a modern e-commerce product detail overlay
 */
export class ProductOverlayCanvasV2 {
  private ctx: CanvasRenderingContext2D;
  private style: OverlayV2Style;

  // Bounds for hit detection
  private overlayBounds: Bounds | null = null;
  private closeButtonBounds: Bounds | null = null;
  private addToCartButtonBounds: Bounds | null = null;
  private viewWebsiteButtonBounds: Bounds | null = null;

  // Image cache
  private imageCache = new Map<string, HTMLImageElement>();
  private currentProductImage: HTMLImageElement | null = null;

  constructor(ctx: CanvasRenderingContext2D, style: OverlayV2Style = MODERN_OVERLAY_STYLE) {
    this.ctx = ctx;
    this.style = style;
  }

  /**
   * Update the style configuration
   */
  public setStyle(style: Partial<OverlayV2Style>): void {
    this.style = { ...this.style, ...style };
  }

  /**
   * Preload product image
   */
  public async preloadImage(product: Product): Promise<void> {
    const media = product.media || [];
    const heroMedia = media.find(m => m.type === 'hero') || media[0];

    if (!heroMedia) return;

    // Build share proxy URL if storage_id is available
    const storageId = (heroMedia as any).storage_id;
    let imageUrl = heroMedia.src;

    if (storageId) {
      imageUrl = `${STORAGE_API_URL}/storage/media/${storageId}?width=800&height=800&format=webp&quality=85`;
    }

    if (this.imageCache.has(imageUrl)) {
      this.currentProductImage = this.imageCache.get(imageUrl)!;
      return;
    }

    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        this.imageCache.set(imageUrl, img);
        this.currentProductImage = img;
        resolve();
      };
      img.onerror = reject;
      img.src = imageUrl;
    });
  }

  /**
   * Render the modern product overlay
   */
  public render(
    product: Product,
    canvasWidth: number,
    canvasHeight: number
  ): void {
    this.ctx.save();

    // Calculate overlay dimensions (larger, centered)
    const overlayWidth = Math.min(1200, canvasWidth * 0.8);
    const overlayHeight = Math.min(800, canvasHeight * 0.85);
    const left = (canvasWidth - overlayWidth) / 2;
    const top = (canvasHeight - overlayHeight) / 2;

    this.overlayBounds = { left, top, width: overlayWidth, height: overlayHeight };

    // Split layout: 40% image, 60% info panel
    const imageWidth = overlayWidth * 0.4;
    const panelWidth = overlayWidth * 0.6;
    const panelLeft = left + imageWidth;

    // Render components
    this.renderImageSection(product, left, top, imageWidth, overlayHeight);
    this.renderInfoPanel(product, panelLeft, top, panelWidth, overlayHeight);
    this.renderCloseButton(left, top, overlayWidth, overlayHeight);

    this.ctx.restore();
  }

  /**
   * Render the product image section (left side)
   */
  private renderImageSection(
    product: Product,
    left: number,
    top: number,
    width: number,
    height: number
  ): void {
    // Background (subtle)
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    this.drawRoundedRectPath(left, top, width, height, 24, true, false);
    this.ctx.fill();

    // Render product image if loaded
    if (this.currentProductImage) {
      const img = this.currentProductImage;
      const imgAspect = img.width / img.height;
      const containerAspect = width / height;

      let drawWidth, drawHeight, drawX, drawY;

      if (imgAspect > containerAspect) {
        // Image is wider - fit to height
        drawHeight = height * 0.85;
        drawWidth = drawHeight * imgAspect;
      } else {
        // Image is taller - fit to width
        drawWidth = width * 0.85;
        drawHeight = drawWidth / imgAspect;
      }

      drawX = left + (width - drawWidth) / 2;
      drawY = top + (height - drawHeight) / 2;

      this.ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);
    }
  }

  /**
   * Render the info panel (right side)
   */
  private renderInfoPanel(
    product: Product,
    left: number,
    top: number,
    width: number,
    height: number
  ): void {
    const padding = 40;

    // Panel background (blue gradient)
    const gradient = this.ctx.createLinearGradient(left, top, left, top + height);
    gradient.addColorStop(0, 'rgba(100, 150, 230, 0.98)');
    gradient.addColorStop(1, 'rgba(80, 120, 200, 0.98)');

    this.drawRoundedRectPath(left, top, width, height, 24, false, true);
    this.ctx.fillStyle = gradient;
    this.ctx.fill();

    let currentY = top + padding;

    // Title
    currentY = this.renderTitle(product, left, currentY, width, padding);

    // Price
    currentY = this.renderPrice(product, left, currentY, width, padding);

    // Dropdowns (Color & Size)
    currentY = this.renderDropdowns(product, left, currentY, width, padding);

    // Features
    currentY = this.renderFeatures(product, left, currentY, width, padding, height);

    // Material info
    currentY = this.renderMaterialInfo(product, left, currentY, width, padding);

    // Buttons
    this.renderButtons(product, left, top + height - padding - 120, width, padding);
  }

  /**
   * Render product title
   */
  private renderTitle(
    product: Product,
    left: number,
    y: number,
    width: number,
    padding: number
  ): number {
    this.ctx.fillStyle = this.style.titleColor;
    this.ctx.font = 'bold 32px system-ui';
    this.ctx.textAlign = 'left';
    this.ctx.textBaseline = 'top';

    const lines = this.wrapText(product.name, width - padding * 2, 32, 'bold');

    for (const line of lines.slice(0, 2)) {
      this.ctx.fillText(line, left + padding, y);
      y += 40;
    }

    return y + 10;
  }

  /**
   * Render price
   */
  private renderPrice(
    product: Product,
    left: number,
    y: number,
    width: number,
    padding: number
  ): number {
    const priceText = product.price?.formatted || `€ ${product.price?.value?.toFixed(2) || '0.00'}`;

    this.ctx.fillStyle = this.style.priceColor;
    this.ctx.font = 'bold 36px system-ui';
    this.ctx.fillText(priceText, left + padding, y);

    return y + 50;
  }

  /**
   * Render dropdown placeholders (Color & Size)
   */
  private renderDropdowns(
    product: Product,
    left: number,
    y: number,
    width: number,
    padding: number
  ): number {
    const dropdownWidth = (width - padding * 3) / 2;
    const dropdownHeight = 50;

    // Extract variants info
    const variants = (product as any).variants || [];
    const colors = [...new Set(variants.map((v: any) => v.option1 || v.name).filter(Boolean))];
    const sizes = [...new Set(variants.map((v: any) => v.option2).filter(Boolean))];

    const colorText = String(colors[0] || 'Black');
    const sizeText = String(sizes[0] || 'Size S');

    // Color dropdown
    this.drawDropdown(left + padding, y, dropdownWidth, dropdownHeight, colorText);

    // Size dropdown
    this.drawDropdown(left + padding * 2 + dropdownWidth, y, dropdownWidth, dropdownHeight, sizeText);

    return y + dropdownHeight + 30;
  }

  /**
   * Draw a single dropdown
   */
  private drawDropdown(x: number, y: number, width: number, height: number, text: string): void {
    // Background
    this.ctx.fillStyle = this.style.dropdownBackground;
    this.drawRoundedRect(x, y, width, height, 12);
    this.ctx.fill();

    // Border
    this.ctx.strokeStyle = this.style.dropdownBorder;
    this.ctx.lineWidth = 2;
    this.ctx.stroke();

    // Text
    this.ctx.fillStyle = this.style.dropdownTextColor;
    this.ctx.font = '16px system-ui';
    this.ctx.textAlign = 'left';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText(text, x + 20, y + height / 2);

    // Dropdown arrow
    const arrowX = x + width - 30;
    const arrowY = y + height / 2;
    this.ctx.strokeStyle = this.style.dropdownTextColor;
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.moveTo(arrowX - 6, arrowY - 3);
    this.ctx.lineTo(arrowX, arrowY + 3);
    this.ctx.lineTo(arrowX + 6, arrowY - 3);
    this.ctx.stroke();
  }

  /**
   * Render feature list with icons
   */
  private renderFeatures(
    product: Product,
    left: number,
    y: number,
    width: number,
    padding: number,
    panelHeight: number
  ): number {
    const features = this.parseKeyFeatures(product);
    const maxY = panelHeight - 250; // Leave space for buttons

    for (const feature of features.slice(0, 4)) {
      if (y > maxY) break;

      // Icon box
      const iconSize = 50;
      this.renderFeatureIcon(left + padding, y, iconSize, feature.icon);

      // Title
      this.ctx.fillStyle = this.style.featureTitleColor;
      this.ctx.font = 'bold 18px system-ui';
      this.ctx.textAlign = 'left';
      this.ctx.textBaseline = 'top';
      this.ctx.fillText(feature.title, left + padding + iconSize + 15, y);

      // Subtitle
      this.ctx.fillStyle = this.style.featureSubtitleColor;
      this.ctx.font = '15px system-ui';
      this.ctx.fillText(feature.subtitle, left + padding + iconSize + 15, y + 24);

      y += 70;
    }

    return y + 10;
  }

  /**
   * Render feature icon
   */
  private renderFeatureIcon(x: number, y: number, size: number, iconType: string): void {
    // Background
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    this.drawRoundedRect(x, y, size, size, 12);
    this.ctx.fill();

    // Icon (simplified text-based for now)
    this.ctx.fillStyle = this.style.featureIconColor;
    this.ctx.font = 'bold 14px system-ui';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';

    const iconText = this.getIconText(iconType);
    this.ctx.fillText(iconText, x + size / 2, y + size / 2);
  }

  /**
   * Get icon text based on feature type
   */
  private getIconText(iconType: string): string {
    const iconMap: Record<string, string> = {
      'layer': '🛡️',
      'protection': '🛡️',
      'breathable': '💨',
      'sealed': '🔒',
      'compatible': '🧥',
      'waterproof': '💧',
      'material': '📋',
    };

    return iconMap[iconType] || '✓';
  }

  /**
   * Render material info
   */
  private renderMaterialInfo(
    product: Product,
    left: number,
    y: number,
    width: number,
    padding: number
  ): number {
    const specs = product.specifications;
    const material = specs?.shell_material || specs?.materials || '100% Polyester';

    // Get size range from variants
    const variants = (product as any).variants || [];
    const sizes = [...new Set(variants.map((v: any) => v.option2).filter(Boolean))];
    const sizeRange = sizes.length > 0 ? `${sizes[0]}-${sizes[sizes.length - 1]}` : 'S-XXL';

    this.ctx.fillStyle = this.style.secondaryTextColor;
    this.ctx.font = '15px system-ui';
    this.ctx.textAlign = 'left';
    this.ctx.textBaseline = 'top';

    this.ctx.fillText(`Material: ${material}`, left + padding, y);
    this.ctx.fillText(`Fit/Sizes: Wide ( ${sizeRange} )`, left + padding, y + 22);

    return y + 60;
  }

  /**
   * Render action buttons
   */
  private renderButtons(
    product: Product,
    left: number,
    y: number,
    width: number,
    padding: number
  ): void {
    const buttonHeight = 55;
    const buttonWidth = width - padding * 2;

    // Add to Cart button
    this.addToCartButtonBounds = {
      left: left + padding,
      top: y,
      width: buttonWidth,
      height: buttonHeight
    };

    const gradient = this.ctx.createLinearGradient(
      left + padding,
      y,
      left + padding + buttonWidth,
      y + buttonHeight
    );
    gradient.addColorStop(0, this.style.primaryButtonGradientStart);
    gradient.addColorStop(1, this.style.primaryButtonGradientEnd);

    this.drawRoundedRect(left + padding, y, buttonWidth, buttonHeight, 14);
    this.ctx.fillStyle = gradient;
    this.ctx.fill();

    this.ctx.fillStyle = this.style.primaryButtonTextColor;
    this.ctx.font = 'bold 20px system-ui';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText('Add to Cart', left + width / 2, y + buttonHeight / 2);
  }

  /**
   * Render close button
   */
  private renderCloseButton(
    left: number,
    top: number,
    width: number,
    height: number
  ): void {
    const size = 44;
    const x = left + width - size - 20;
    const y = top + 20;

    this.closeButtonBounds = { left: x, top: y, width: size, height: size };

    // Background
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    this.ctx.beginPath();
    this.ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
    this.ctx.fill();

    // X symbol
    this.ctx.strokeStyle = 'white';
    this.ctx.lineWidth = 3;
    this.ctx.lineCap = 'round';
    const offset = size * 0.3;
    this.ctx.beginPath();
    this.ctx.moveTo(x + offset, y + offset);
    this.ctx.lineTo(x + size - offset, y + size - offset);
    this.ctx.moveTo(x + size - offset, y + offset);
    this.ctx.lineTo(x + offset, y + size - offset);
    this.ctx.stroke();
  }

  /**
   * Parse key features from product data
   */
  private parseKeyFeatures(product: Product): ParsedFeature[] {
    const keyFeatures = (product as any).key_features || [];
    const features: ParsedFeature[] = [];

    for (const featureStr of keyFeatures) {
      const parts = featureStr.split(':');
      const title = parts[0]?.trim() || featureStr;
      const subtitle = parts[1]?.trim() || '';

      // Detect icon type from title
      let icon = 'default';
      const lowerTitle = title.toLowerCase();
      if (lowerTitle.includes('layer') || lowerTitle.includes('protection')) icon = 'layer';
      if (lowerTitle.includes('breathable')) icon = 'breathable';
      if (lowerTitle.includes('sealed') || lowerTitle.includes('seam')) icon = 'sealed';
      if (lowerTitle.includes('compatible') || lowerTitle.includes('jacket')) icon = 'compatible';
      if (lowerTitle.includes('waterproof') || lowerTitle.includes('mm')) icon = 'waterproof';

      features.push({ title, subtitle, icon });
    }

    return features;
  }

  /**
   * Check if a click hits the overlay or its buttons
   */
  public checkClick(
    screenX: number,
    screenY: number
  ): OverlayClickResult {
    if (!this.overlayBounds) return null;

    // Check if within overlay
    const inOverlay = screenX >= this.overlayBounds.left &&
                      screenX <= this.overlayBounds.left + this.overlayBounds.width &&
                      screenY >= this.overlayBounds.top &&
                      screenY <= this.overlayBounds.top + this.overlayBounds.height;

    if (!inOverlay) return null;

    // Check buttons
    if (this.closeButtonBounds && this.isPointInBounds(screenX, screenY, this.closeButtonBounds)) {
      return 'close';
    }
    if (this.addToCartButtonBounds && this.isPointInBounds(screenX, screenY, this.addToCartButtonBounds)) {
      return 'add-to-cart';
    }

    return 'background';
  }

  /**
   * Utility: Draw rounded rectangle
   */
  private drawRoundedRect(x: number, y: number, width: number, height: number, radius: number): void {
    this.drawRoundedRectPath(x, y, width, height, radius);
  }

  /**
   * Utility: Draw rounded rectangle path
   */
  private drawRoundedRectPath(
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
    leftSide: boolean = true,
    rightSide: boolean = true
  ): void {
    this.ctx.beginPath();

    if (leftSide) {
      this.ctx.moveTo(x + radius, y);
      this.ctx.lineTo(x + width - (rightSide ? radius : 0), y);
    } else {
      this.ctx.moveTo(x, y);
      this.ctx.lineTo(x + width - (rightSide ? radius : 0), y);
    }

    if (rightSide) {
      this.ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
      this.ctx.lineTo(x + width, y + height - radius);
      this.ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    } else {
      this.ctx.lineTo(x + width, y);
      this.ctx.lineTo(x + width, y + height);
    }

    if (rightSide) {
      this.ctx.lineTo(x + (leftSide ? radius : 0), y + height);
    } else {
      this.ctx.lineTo(x, y + height);
    }

    if (leftSide) {
      this.ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
      this.ctx.lineTo(x, y + radius);
      this.ctx.quadraticCurveTo(x, y, x + radius, y);
    } else {
      this.ctx.lineTo(x, y);
    }

    this.ctx.closePath();
  }

  /**
   * Utility: Wrap text to fit within max width
   */
  private wrapText(text: string, maxWidth: number, fontSize: number, fontWeight: string = 'normal'): string[] {
    this.ctx.font = `${fontWeight} ${fontSize}px system-ui`;
    const words = text.split(' ');
    const lines: string[] = [];
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

    if (currentLine) lines.push(currentLine);
    return lines;
  }

  /**
   * Utility: Check if point is within bounds
   */
  private isPointInBounds(x: number, y: number, bounds: Bounds): boolean {
    return x >= bounds.left &&
           x <= bounds.left + bounds.width &&
           y >= bounds.top &&
           y <= bounds.top + bounds.height;
  }
}
