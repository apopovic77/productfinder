import { InterpolatedProperty } from 'arkturian-typescript-utils';
import { Vector2 } from 'arkturian-typescript-utils';

export class LayoutNode<T> {
  id: string;
  data: T;
  posX = new InterpolatedProperty<number>('posX', 0, 0, 0.25);
  posY = new InterpolatedProperty<number>('posY', 0, 0, 0.25);
  width = new InterpolatedProperty<number>('width', 0, 0, 0.25);
  height = new InterpolatedProperty<number>('height', 0, 0, 0.25);
  opacity = new InterpolatedProperty<number>('opacity', 1, 1, 0.2);
  scale = new InterpolatedProperty<number>('scale', 1, 1, 0.25);
  zIndex = 0;
  constructor(id: string, data: T) { this.id = id; this.data = data; }
  setTargets(pos: Vector2, size: Vector2, opacity?: number, scale?: number) {
    this.posX.targetValue = pos.x; this.posY.targetValue = pos.y;
    this.width.targetValue = size.x; this.height.targetValue = size.y;
    if (opacity !== undefined) this.opacity.targetValue = opacity;
    if (scale !== undefined) this.scale.targetValue = scale;
  }
}




