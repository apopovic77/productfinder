import type { Product } from '../types/Product';

/**
 * Styling configuration for the product overlay
 */
export interface OverlayStyle {
  // Colors
  backgroundColor: string;
  backdropBlur: number;
  borderColor: string;
  textColor: string;
  textColorSecondary: string;

  // Button colors
  primaryButtonGradientStart: string;
  primaryButtonGradientEnd: string;
  primaryButtonTextColor: string;
  secondaryButtonBackground: string;
  secondaryButtonBorder: string;
  secondaryButtonTextColor: string;

  // Close button
  closeButtonBackground: string;
  closeButtonColor: string;

  // Sizing ratios (relative to overlay height)
  overlayHeightRatio: number; // Relative to product height
  overlayAspectRatio: number; // Width/height
  paddingRatio: number;
  borderRadiusRatio: number;
}

/**
 * Default modern glassmorphism style with cyan gradient
 */
export const DEFAULT_OVERLAY_STYLE: OverlayStyle = {
  backgroundColor: 'rgba(255, 255, 255, 0.95)',
  backdropBlur: 10,
  borderColor: 'rgba(0, 0, 0, 0.08)',
  textColor: '#1f2937',
  textColorSecondary: 'rgba(0, 0, 0, 0.6)',

  primaryButtonGradientStart: '#2aa8ef',
  primaryButtonGradientEnd: '#12d4de',
  primaryButtonTextColor: 'white',
  secondaryButtonBackground: 'rgba(0, 0, 0, 0.05)',
  secondaryButtonBorder: 'rgba(0, 0, 0, 0.1)',
  secondaryButtonTextColor: '#1f2937',

  closeButtonBackground: 'rgba(0, 0, 0, 0.05)',
  closeButtonColor: '#1f2937',

  overlayHeightRatio: 0.45,
  overlayAspectRatio: 0.86,
  paddingRatio: 0.055,
  borderRadiusRatio: 0.057,
};

interface Bounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

export type OverlayClickResult = 'close' | 'view' | 'cart' | 'background' | null;

/**
 * Product Overlay Renderer for Canvas
 * Renders a glassmorphism-style product detail overlay on a canvas
 */
export class ProductOverlayCanvas {
  private ctx: CanvasRenderingContext2D;
  private style: OverlayStyle;

  // Bounds for hit detection
  private overlayBounds: Bounds | null = null;
  private closeButtonBounds: Bounds | null = null;
  private viewButtonBounds: Bounds | null = null;
  private cartButtonBounds: Bounds | null = null;

  constructor(ctx: CanvasRenderingContext2D, style: OverlayStyle = DEFAULT_OVERLAY_STYLE) {
    this.ctx = ctx;
    this.style = style;
  }

  /**
   * Update the style configuration
   */
  public setStyle(style: Partial<OverlayStyle>): void {
    this.style = { ...this.style, ...style };
  }

  /**
   * Render the product overlay
   */
  public render(
    product: Product,
    productBounds: Bounds,
    anchorY: number
  ): void {
    this.ctx.save();

    const productWidth = productBounds.width;
    const productHeight = productBounds.height;
    const productX = productBounds.left;

    // Calculate overlay dimensions
    const overlayHeight = productHeight * this.style.overlayHeightRatio;
    const overlayWidth = overlayHeight * this.style.overlayAspectRatio;
    const padding = overlayHeight * this.style.paddingRatio;

    // Position overlay
    const cellMargin = productWidth * 0.0;
    const left = productX + productWidth - overlayWidth - cellMargin;
    const top = anchorY - overlayHeight * 0.3;

    // Store bounds for hit detection
    this.overlayBounds = { left, top, width: overlayWidth, height: overlayHeight };

    // Render components
    this.renderBackground(left, top, overlayWidth, overlayHeight);
    this.renderCloseButton(left, top, overlayWidth, overlayHeight, padding);
    this.renderHeader(product, left, top, overlayWidth, overlayHeight, padding);
    this.renderFeatures(product, left, top, overlayWidth, overlayHeight, padding);
    this.renderButtons(left, top, overlayWidth, overlayHeight, padding);

    this.ctx.restore();
  }

  /**
   * Check if a click hits the overlay or its buttons
   */
  public checkClick(
    screenX: number,
    screenY: number,
    viewport: { scale: number; offset: { x: number; y: number } }
  ): OverlayClickResult {
    if (!this.overlayBounds) return null;

    // Convert screen to world coordinates
    const worldX = (screenX - viewport.offset.x) / viewport.scale;
    const worldY = (screenY - viewport.offset.y) / viewport.scale;

    // Check if within overlay
    const inOverlay = worldX >= this.overlayBounds.left &&
                      worldX <= this.overlayBounds.left + this.overlayBounds.width &&
                      worldY >= this.overlayBounds.top &&
                      worldY <= this.overlayBounds.top + this.overlayBounds.height;

    if (!inOverlay) return null;

    // Check buttons
    if (this.closeButtonBounds && this.isPointInBounds(worldX, worldY, this.closeButtonBounds)) {
      return 'close';
    }
    if (this.viewButtonBounds && this.isPointInBounds(worldX, worldY, this.viewButtonBounds)) {
      return 'view';
    }
    if (this.cartButtonBounds && this.isPointInBounds(worldX, worldY, this.cartButtonBounds)) {
      return 'cart';
    }

    return 'background';
  }

  /**
   * Render the glassmorphism background
   */
  private renderBackground(left: number, top: number, width: number, height: number): void {
    const borderRadius = height * this.style.borderRadiusRatio;

    this.drawRoundedRect(left, top, width, height, borderRadius);
    this.ctx.fillStyle = this.style.backgroundColor;
    this.ctx.fill();

    // Border
    this.ctx.strokeStyle = this.style.borderColor;
    this.ctx.lineWidth = height * 0.0036;
    this.ctx.stroke();
  }

  /**
   * Render the close button
   */
  private renderCloseButton(
    left: number,
    top: number,
    width: number,
    height: number,
    padding: number
  ): void {
    const closeButtonSize = height * 0.076;
    const closeButtonX = left + width - closeButtonSize - padding * 0.43;
    const closeButtonY = top + padding * 0.43;

    this.closeButtonBounds = {
      left: closeButtonX,
      top: closeButtonY,
      width: closeButtonSize,
      height: closeButtonSize
    };

    // Button background
    this.ctx.beginPath();
    this.ctx.arc(
      closeButtonX + closeButtonSize / 2,
      closeButtonY + closeButtonSize / 2,
      closeButtonSize / 2,
      0,
      Math.PI * 2
    );
    this.ctx.fillStyle = this.style.closeButtonBackground;
    this.ctx.fill();

    // X symbol
    this.ctx.strokeStyle = this.style.closeButtonColor;
    this.ctx.lineWidth = height * 0.0048;
    this.ctx.lineCap = 'round';
    const xOffset = closeButtonSize * 0.25;
    this.ctx.beginPath();
    this.ctx.moveTo(closeButtonX + xOffset, closeButtonY + xOffset);
    this.ctx.lineTo(closeButtonX + closeButtonSize - xOffset, closeButtonY + closeButtonSize - xOffset);
    this.ctx.moveTo(closeButtonX + closeButtonSize - xOffset, closeButtonY + xOffset);
    this.ctx.lineTo(closeButtonX + xOffset, closeButtonY + closeButtonSize - xOffset);
    this.ctx.stroke();
  }

  /**
   * Render the product header (name and price)
   */
  private renderHeader(
    product: Product,
    left: number,
    top: number,
    width: number,
    height: number,
    padding: number
  ): void {
    const nameFontSize = height * 0.043;
    const closeButtonSize = height * 0.076;
    const maxTextWidth = width - padding * 2 - closeButtonSize - padding * 0.29;
    const nameLines = this.wrapText(product.name, maxTextWidth, nameFontSize, 'bold');

    this.ctx.fillStyle = this.style.textColor;
    this.ctx.font = `bold ${nameFontSize}px system-ui`;
    this.ctx.textAlign = 'left';
    this.ctx.textBaseline = 'top';

    let textY = top + padding;
    const lineHeight = height * 0.057;

    // Product name (max 2 lines)
    for (const line of nameLines.slice(0, 2)) {
      this.ctx.fillText(line, left + padding, textY);
      textY += lineHeight;
    }

    // Price
    if (product.price?.value) {
      textY += height * 0.029;
      const priceFontSize = height * 0.067;
      this.ctx.font = `bold ${priceFontSize}px system-ui`;
      this.ctx.fillStyle = this.style.textColor;
      this.ctx.fillText(`€ ${product.price.value.toFixed(2)}`, left + padding, textY);
    }
  }

  /**
   * Render the product features/details
   */
  private renderFeatures(
    product: Product,
    left: number,
    top: number,
    width: number,
    height: number,
    padding: number
  ): void {
    // Calculate starting Y position (after header)
    let textY = top + padding;
    const lineHeight = height * 0.057;
    const nameLines = this.wrapText(product.name, width - padding * 2, height * 0.043, 'bold');
    textY += lineHeight * Math.min(nameLines.length, 2);

    if (product.price?.value) {
      textY += height * 0.029 + height * 0.095;
    } else {
      textY += height * 0.048;
    }

    textY += height * 0.03;

    const bulletLineHeight = height * 0.065;
    const bulletSize = height * 0.008;
    const bulletOffset = height * 0.035;
    const featureFontSize = height * 0.029;
    this.ctx.font = `${featureFontSize}px system-ui`;

    const features = this.extractFeatures(product);

    for (const feature of features.slice(0, 8)) {
      // Bullet point
      this.ctx.fillStyle = this.style.textColorSecondary;
      this.ctx.beginPath();
      this.ctx.arc(
        left + padding + bulletSize + height * 0.004,
        textY + height * 0.015,
        bulletSize,
        0,
        Math.PI * 2
      );
      this.ctx.fill();

      // Feature text
      this.ctx.fillStyle = this.style.textColor;
      this.ctx.fillText(feature, left + padding + bulletOffset, textY);
      textY += bulletLineHeight;
    }
  }

  /**
   * Render action buttons
   */
  private renderButtons(
    left: number,
    top: number,
    width: number,
    height: number,
    padding: number
  ): void {
    const buttonY = top + height - height * 0.286;
    const buttonHeight = height * 0.114;
    const buttonRadius = height * 0.029;
    const buttonSpacing = height * 0.024;
    const buttonWidth = width - padding * 2;

    // View on Website button
    const viewButtonY = buttonY;
    const buttonFontSize = height * 0.033;

    this.viewButtonBounds = {
      left: left + padding,
      top: viewButtonY,
      width: buttonWidth,
      height: buttonHeight
    };

    this.drawRoundedRect(left + padding, viewButtonY, buttonWidth, buttonHeight, buttonRadius);
    this.ctx.fillStyle = this.style.secondaryButtonBackground;
    this.ctx.fill();
    this.ctx.strokeStyle = this.style.secondaryButtonBorder;
    this.ctx.lineWidth = height * 0.0036;
    this.ctx.stroke();

    this.ctx.fillStyle = this.style.secondaryButtonTextColor;
    this.ctx.font = `500 ${buttonFontSize}px system-ui`;
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText('🌐 View on Website', left + width / 2, viewButtonY + buttonHeight / 2);

    // Add to Cart button (with gradient)
    const cartButtonY = viewButtonY + buttonHeight + buttonSpacing;
    const cartButtonFontSize = height * 0.036;

    this.cartButtonBounds = {
      left: left + padding,
      top: cartButtonY,
      width: buttonWidth,
      height: buttonHeight
    };

    // Create gradient for primary button
    const gradient = this.ctx.createLinearGradient(
      left + padding,
      cartButtonY,
      left + padding + buttonWidth,
      cartButtonY + buttonHeight
    );
    gradient.addColorStop(0, this.style.primaryButtonGradientStart);
    gradient.addColorStop(1, this.style.primaryButtonGradientEnd);

    this.drawRoundedRect(left + padding, cartButtonY, buttonWidth, buttonHeight, buttonRadius);
    this.ctx.fillStyle = gradient;
    this.ctx.fill();

    this.ctx.fillStyle = this.style.primaryButtonTextColor;
    this.ctx.font = `600 ${cartButtonFontSize}px system-ui`;
    this.ctx.fillText('Add to Cart', left + width / 2, cartButtonY + buttonHeight / 2);
  }

  /**
   * Extract features from product data
   */
  private extractFeatures(product: Product): string[] {
    const features: string[] = [];

    const presentationCategory = product.getAttributeDisplayValue('presentation_category');
    if (presentationCategory) features.push(`Category: ${presentationCategory}`);
    if (product.sku) features.push(`SKU: ${product.sku}`);
    if (product.aiAnalysis?.style) features.push(`Style: ${product.aiAnalysis.style}`);

    if (product.aiAnalysis?.dominantColors && product.aiAnalysis.dominantColors.length > 0) {
      const colors = product.aiAnalysis.dominantColors.slice(0, 2).join(', ');
      features.push(`Colors: ${colors}`);
    }

    if (product.aiAnalysis?.materials && product.aiAnalysis.materials.length > 0) {
      const materials = product.aiAnalysis.materials.slice(0, 2).join(', ');
      features.push(`Materials: ${materials}`);
    }

    if (product.specifications?.dimensions) {
      features.push(`Dimensions: ${product.specifications.dimensions}`);
    }

    if (product.weight) features.push(`Weight: ${product.weight}g`);
    if (product.season) features.push(`Season: ${product.season}`);

    if (product.aiAnalysis?.features && product.aiAnalysis.features.length > 0) {
      product.aiAnalysis.features.slice(0, 2).forEach(f => features.push(f));
    }

    if (product.aiAnalysis?.useCases && product.aiAnalysis.useCases.length > 0) {
      product.aiAnalysis.useCases.slice(0, 2).forEach(uc => features.push(`Use: ${uc}`));
    }

    if (product.aiAnalysis?.targetAudience && product.aiAnalysis.targetAudience.length > 0) {
      const audience = product.aiAnalysis.targetAudience.slice(0, 1).join(', ');
      features.push(`Target: ${audience}`);
    }

    return features;
  }

  /**
   * Utility: Draw rounded rectangle
   */
  private drawRoundedRect(x: number, y: number, width: number, height: number, radius: number): void {
    this.ctx.beginPath();
    this.ctx.moveTo(x + radius, y);
    this.ctx.lineTo(x + width - radius, y);
    this.ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    this.ctx.lineTo(x + width, y + height - radius);
    this.ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    this.ctx.lineTo(x + radius, y + height);
    this.ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    this.ctx.lineTo(x, y + radius);
    this.ctx.quadraticCurveTo(x, y, x + radius, y);
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
