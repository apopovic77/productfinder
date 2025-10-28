import { InterpolatedProperty } from 'arkturian-typescript-utils';
import { Vector2 } from 'arkturian-typescript-utils';

/**
 * LayoutNode represents a persistent visual element in the layout.
 * 
 * IMPORTANT: This node is created ONCE per unique ID and then REUSED.
 * The InterpolatedProperty instances are created in the constructor and
 * remain persistent across layout updates, enabling smooth animations
 * when target values change.
 * 
 * See LayoutEngine.sync() - nodes are only created when !nodes.has(id)
 */
export class LayoutNode<T> {
  id: string;
  data: T;
  
  // These properties are created ONCE in constructor and persist
  // across all layout updates for smooth interpolation
  readonly posX: InterpolatedProperty<number>;
  readonly posY: InterpolatedProperty<number>;
  readonly width: InterpolatedProperty<number>;
  readonly height: InterpolatedProperty<number>;
  readonly opacity: InterpolatedProperty<number>;
  readonly scale: InterpolatedProperty<number>;
  
  zIndex = 0;
  isNew = true;
  
  constructor(id: string, data: T) { 
    this.id = id; 
    this.data = data;
    
    // Initialize interpolated properties ONCE
    // These will persist and smoothly interpolate when targets change
    this.posX = new InterpolatedProperty<number>('posX', 0, 0, 0.4);
    this.posY = new InterpolatedProperty<number>('posY', 0, 0, 0.4);
    this.width = new InterpolatedProperty<number>('width', 0, 0, 0.3);
    this.height = new InterpolatedProperty<number>('height', 0, 0, 0.3);
    this.opacity = new InterpolatedProperty<number>('opacity', 0, 0, 0.3);
    this.scale = new InterpolatedProperty<number>('scale', 0.8, 0.8, 0.35);
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
  
  setAnimationDuration(seconds: number) {
    const duration = Math.max(0.01, seconds);
    this.posX.setDuration(duration);
    this.posY.setDuration(duration);
    this.width.setDuration(duration);
    this.height.setDuration(duration);
    this.opacity.setDuration(duration);
    this.scale.setDuration(duration);
  }
}



