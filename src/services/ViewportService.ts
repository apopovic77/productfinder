import { ViewportTransform } from '../utils/ViewportTransform';
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

