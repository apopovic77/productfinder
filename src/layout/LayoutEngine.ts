import { LayoutNode } from './LayoutNode';

/**
 * Interface for any layouter that can compute layout for nodes
 */
export interface ILayouter<T> {
  compute(nodes: LayoutNode<T>[], view: { width: number; height: number }): void;
}

/**
 * LayoutEngine manages a persistent pool of LayoutNodes.
 * 
 * Key concept: Nodes are created ONCE per ID and reused across updates.
 * This enables smooth interpolation via InterpolatedProperty - when layout
 * changes, only target values are updated, not the nodes themselves.
 * 
 * Similar to object pooling in C# (e.g., PivotLayouter in SlimDX projects)
 */
export class LayoutEngine<T> {
  // Persistent node pool - nodes are reused, not recreated
  private nodes = new Map<string, LayoutNode<T>>();
  private layouter: ILayouter<T>;
  private orderedIds: string[] = []; // Track order of items
  
  constructor(layouter: ILayouter<T>) {
    this.layouter = layouter;
  }
  
  /**
   * Update the layouter while keeping nodes intact.
   * This allows changing layout modes without losing InterpolatedProperty state.
   */
  setLayouter(layouter: ILayouter<T>): void {
    this.layouter = layouter;
  }
  
  /**
   * Sync items with node pool.
   * - Existing nodes: Keep and update data only
   * - New items: Create new nodes (with fresh InterpolatedProperties)
   * - Removed items: Delete nodes
   * - IMPORTANT: Preserves the order of items for sorting!
   */
  sync(items: T[], idOf: (t: T) => string) {
    const keep = new Set<string>();
    this.orderedIds = []; // Reset order
    
    for (const it of items) {
      const id = idOf(it);
      keep.add(id);
      this.orderedIds.push(id); // Track order
      
      // IMPORTANT: Only create node if it doesn't exist yet!
      // This preserves InterpolatedProperty state for smooth animations
      if (!this.nodes.has(id)) {
        this.nodes.set(id, new LayoutNode<T>(id, it));
      } else {
        // Node exists - just update data, keep properties intact
        this.nodes.get(id)!.data = it;
      }
    }
    // Remove nodes that are no longer in items
    for (const id of Array.from(this.nodes.keys())) {
      if (!keep.has(id)) this.nodes.delete(id);
    }
  }
  
  layout(view: { width: number; height: number }) {
    // Get nodes in the correct order (as provided in sync)
    const orderedNodes = this.orderedIds
      .map(id => this.nodes.get(id))
      .filter((n): n is LayoutNode<T> => n !== undefined);
    
    this.layouter.compute(orderedNodes, view);
  }
  
  all(): LayoutNode<T>[] { 
    // Return nodes in the correct order
    return this.orderedIds
      .map(id => this.nodes.get(id))
      .filter((n): n is LayoutNode<T> => n !== undefined);
  }
}




