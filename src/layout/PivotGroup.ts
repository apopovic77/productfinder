import { InterpolatedProperty } from 'arkturian-typescript-utils';

/**
 * Represents a hierarchical pivot group (e.g., category, subcategory)
 * OOP design: Self-contained group with position, size, and hierarchy
 */
export class PivotGroup {
  // Visual properties (animated)
  public posX = new InterpolatedProperty<number>('posX', 0, 0, 0.4);
  public posY = new InterpolatedProperty<number>('posY', 0, 0, 0.4);
  public width = new InterpolatedProperty<number>('width', 0, 0, 0.3);
  public height = new InterpolatedProperty<number>('height', 0, 0, 0.3);
  public opacity = new InterpolatedProperty<number>('opacity', 1, 1, 0.3);
  
  // Hierarchy
  public children: PivotGroup[] = [];
  public parent: PivotGroup | null = null;
  
  // State
  public isExpanded = false;
  public isVisible = true;
  
  constructor(
    public readonly key: string,
    public readonly label: string,
    public readonly level: number = 0
  ) {}
  
  /**
   * Add a child group
   */
  addChild(child: PivotGroup): void {
    child.parent = this;
    this.children.push(child);
  }
  
  /**
   * Check if this group contains a point (for hit testing)
   */
  containsPoint(x: number, y: number): boolean {
    const px = this.posX.value ?? 0;
    const py = this.posY.value ?? 0;
    const w = this.width.value ?? 0;
    const h = this.height.value ?? 0;
    
    return x >= px && x <= px + w && y >= py && y <= py + h;
  }
  
  /**
   * Get all ancestor groups
   */
  getAncestors(): PivotGroup[] {
    const ancestors: PivotGroup[] = [];
    let current = this.parent;
    while (current) {
      ancestors.unshift(current);
      current = current.parent;
    }
    return ancestors;
  }
  
  /**
   * Get all descendant groups (recursive)
   */
  getDescendants(): PivotGroup[] {
    const descendants: PivotGroup[] = [];
    for (const child of this.children) {
      descendants.push(child);
      descendants.push(...child.getDescendants());
    }
    return descendants;
  }
  
  /**
   * Check if this group is an ancestor of another
   */
  isAncestorOf(group: PivotGroup): boolean {
    let current = group.parent;
    while (current) {
      if (current === this) return true;
      current = current.parent;
    }
    return false;
  }
  
  /**
   * Expand this group (drill-down)
   */
  expand(): void {
    this.isExpanded = true;
  }
  
  /**
   * Collapse this group (drill-up)
   */
  collapse(): void {
    this.isExpanded = false;
  }
  
  /**
   * Toggle expansion state
   */
  toggle(): void {
    this.isExpanded = !this.isExpanded;
  }
}

