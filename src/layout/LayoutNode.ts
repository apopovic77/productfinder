import { InterpolatedProperty } from 'arkturian-typescript-utils';
import { Vector2 } from 'arkturian-typescript-utils';

export class LayoutNode<T> {
  id: string;
  data: T;
  posX = new InterpolatedProperty<number>('posX', 0, 0, 0.4);
  posY = new InterpolatedProperty<number>('posY', 0, 0, 0.4);
  width = new InterpolatedProperty<number>('width', 0, 0, 0.3);
  height = new InterpolatedProperty<number>('height', 0, 0, 0.3);
  opacity = new InterpolatedProperty<number>('opacity', 0, 0, 0.3);
  scale = new InterpolatedProperty<number>('scale', 0.8, 0.8, 0.35);
  zIndex = 0;
  isNew = true;
  
  constructor(id: string, data: T) { 
    this.id = id; 
    this.data = data;
  }
  
  setTargets(pos: Vector2, size: Vector2, opacity?: number, scale?: number) {
    this.posX.targetValue = pos.x; 
    this.posY.targetValue = pos.y;
    this.width.targetValue = size.x; 
    this.height.targetValue = size.y;
    if (opacity !== undefined) this.opacity.targetValue = opacity;
    if (scale !== undefined) this.scale.targetValue = scale;
    
    // Fade in new nodes
    if (this.isNew) {
      this.opacity.targetValue = 1;
      this.scale.targetValue = 1;
      this.isNew = false;
    }
  }
}




