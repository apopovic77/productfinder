import { ViewportTransform, type ContentBounds } from '../utils/ViewportTransform';
import { Vector2 } from 'arkturian-typescript-utils';

export class ViewportService {
  private transform: ViewportTransform | null = null;

  initialize(canvas: HTMLCanvasElement): void {
    if (this.transform) {
      this.transform.destroy();
    }
    this.transform = new ViewportTransform(canvas);
  }

  destroy(): void {
    if (this.transform) {
      this.transform.destroy();
      this.transform = null;
    }
  }

  reset(): void {
    this.transform?.reset();
  }

  /**
   * Reset viewport to fit all content
   */
  resetToFitContent(): void {
    this.transform?.reset();
  }

  /**
   * Update viewport interpolation - call this every frame!
   */
  update(): void {
    this.transform?.update();
  }

  /**
   * Set content bounds for bounds checking and fit-to-content calculation
   */
  setContentBounds(bounds: ContentBounds): void {
    this.transform?.setContentBounds(bounds);
  }

  /**
   * Update viewport size when canvas resizes
   */
  updateViewportSize(): void {
    this.transform?.updateViewportSize();
  }

  getTransform(): ViewportTransform | null {
    return this.transform;
  }

  screenToWorld(screenX: number, screenY: number): Vector2 {
    if (!this.transform) return new Vector2(screenX, screenY);
    return this.transform.screenToWorld(screenX, screenY);
  }

  getScale(): number {
    return this.transform?.scale ?? 1;
  }

  getOffset(): Vector2 {
    return this.transform?.offset ?? new Vector2(0, 0);
  }
}

