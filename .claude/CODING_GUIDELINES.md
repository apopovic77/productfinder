# Coding Guidelines for ProductFinder

This document defines the development principles and patterns used in the ProductFinder project. All code contributions must follow these guidelines to maintain consistency, quality, and adherence to true Object-Oriented Programming (OOP) principles.

## Core Philosophy

### 1. True OOP - Not Procedural Programming

**DO**: Design with objects that encapsulate state and behavior
**DON'T**: Write procedural code with data structures and functions

#### Examples

**❌ BAD - Procedural Style**
```typescript
// Separate data and functions
interface ProductData {
  id: string;
  imageUrl: string;
  imageLoaded: boolean;
}

// Utility functions that operate on data
function loadProductImage(product: ProductData): Promise<void> {
  // ...
}

function isProductImageReady(product: ProductData): boolean {
  return product.imageLoaded;
}
```

**✅ GOOD - OOP Style**
```typescript
// Self-contained class with encapsulated state and behavior
class Product {
  private _image: HTMLImageElement | null = null;
  private _imageLoading = false;

  async loadImage(): Promise<HTMLImageElement | null> {
    // Object manages its own state
  }

  get isImageReady(): boolean {
    // Object knows how to check its own state
    return !!(this._image && this._image.complete);
  }
}
```

**Why this matters:**
- Objects manage their own state (encapsulation)
- Behavior is coupled with data
- No need for utility functions that take data as parameters
- Easier to maintain, test, and reason about

### 2. Encapsulation - Hide Implementation Details

**DO**: Use private fields and expose only necessary public API
**DON'T**: Expose internal state directly

#### Examples

**❌ BAD - Exposed Internals**
```typescript
class Product {
  public image: HTMLImageElement | null = null;
  public imageLoading: boolean = false;
  public imageError: boolean = false;
}

// External code directly manipulates state
product.image = someImage;
product.imageLoading = true;
```

**✅ GOOD - Encapsulated State**
```typescript
class Product {
  private _image: HTMLImageElement | null = null;
  private _imageLoading = false;
  private _imageError = false;

  // Controlled access through methods
  get image(): HTMLImageElement | null {
    return this._image;
  }

  get isImageReady(): boolean {
    return !!(this._image && this._image.complete && !this._imageError);
  }

  // Only the class can modify internal state
  async loadImage(): Promise<HTMLImageElement | null> {
    this._imageLoading = true;
    // ... load image
    this._imageLoading = false;
  }
}
```

**Why this matters:**
- Internal state cannot be corrupted by external code
- Implementation can change without breaking external code
- Invariants are maintained (e.g., `_imageLoading` always reflects reality)

### 3. Single Responsibility Principle

Each class should have one clear responsibility.

#### Examples

**❌ BAD - God Class**
```typescript
class ProductManager {
  loadFromAPI() { /* ... */ }
  renderToCanvas() { /* ... */ }
  calculateLayout() { /* ... */ }
  cacheImages() { /* ... */ }
  handleUserInput() { /* ... */ }
}
```

**✅ GOOD - Focused Classes**
```typescript
class ProductRepository {
  async loadFromAPI(): Promise<Product[]> { /* ... */ }
}

class CanvasRenderer {
  draw(): void { /* ... */ }
}

class LayoutEngine {
  layout(viewport: Viewport): void { /* ... */ }
}

class Product {
  async loadImage(): Promise<HTMLImageElement | null> { /* ... */ }
}
```

**Why this matters:**
- Easier to understand and maintain
- Easier to test in isolation
- Changes in one area don't affect others
- Reusable components

### 4. Dependency Injection - Compose Over Inherit

**DO**: Pass dependencies through constructor
**DON'T**: Create dependencies inside the class or use inheritance for code reuse

#### Examples

**❌ BAD - Hard-Coded Dependencies**
```typescript
class CanvasRenderer {
  private layoutEngine: LayoutEngine;

  constructor() {
    // Creates its own dependencies
    this.layoutEngine = new LayoutEngine();
  }
}
```

**✅ GOOD - Injected Dependencies**
```typescript
class CanvasRenderer<T> {
  constructor(
    private ctx: CanvasRenderingContext2D,
    private getNodes: () => LayoutNode<T>[],
    private renderAccessors: RenderAccessors<T>,
    private viewport: ViewportTransform | null = null,
    private getGroupHeaders: () => GroupHeaderInfo[] = () => []
  ) {}
}

// Usage
const renderer = new CanvasRenderer(
  ctx,
  () => engine.all(),
  { label: (p) => p.name, priceText: (p) => p.priceText },
  viewport,
  () => layouter.getGroupHeaders()
);
```

**Why this matters:**
- Testable (can inject mocks)
- Flexible (can swap implementations)
- No tight coupling between classes
- Clear dependencies visible in constructor

### 5. Generics - Reusable Components

**DO**: Use generics to create type-safe, reusable components
**DON'T**: Hard-code specific types in general-purpose classes

#### Examples

**❌ BAD - Specific Type**
```typescript
class LayoutNode {
  constructor(
    public id: string,
    public data: Product  // Hard-coded to Product
  ) {}
}

class PivotLayouter {
  compute(nodes: LayoutNode[]): void {
    // Only works with Product
  }
}
```

**✅ GOOD - Generic Type**
```typescript
class LayoutNode<T> {
  constructor(
    public id: string,
    public data: T  // Generic type
  ) {}
}

class PivotLayouter<T> {
  compute(nodes: LayoutNode<T>[]): void {
    // Works with any type T
  }
}

// Usage - type-safe for specific type
const productLayouter = new PivotLayouter<Product>(config);
const orderLayouter = new PivotLayouter<Order>(config);
```

**Why this matters:**
- Reusable across different data types
- Type-safe (compiler checks types)
- No code duplication
- Easier to maintain

### 6. Strategy Pattern - Configurable Behavior

**DO**: Use strategies to vary behavior
**DON'T**: Use if/else chains or inheritance hierarchies

#### Examples

**❌ BAD - Conditional Logic**
```typescript
class Layouter {
  layout(type: 'grid' | 'pivot' | 'ranked') {
    if (type === 'grid') {
      // Grid logic
    } else if (type === 'pivot') {
      // Pivot logic
    } else if (type === 'ranked') {
      // Ranked logic
    }
  }
}
```

**✅ GOOD - Strategy Pattern**
```typescript
interface LayoutStrategy<T> {
  compute(
    nodes: LayoutNode<T>[],
    frame: Frame,
    accessors: LayoutAccessors<T>
  ): void;
}

class GridLayoutStrategy<T> implements LayoutStrategy<T> {
  compute(nodes, frame, accessors) {
    // Grid logic
  }
}

class RankedLayoutStrategy<T> implements LayoutStrategy<T> {
  compute(nodes, frame, accessors) {
    // Ranked logic
  }
}

// Usage
const layouter = new PivotLayouter({
  innerLayoutFactory: () => new GridLayoutStrategy()
});
```

**Why this matters:**
- Open/Closed Principle (open for extension, closed for modification)
- Easy to add new strategies without changing existing code
- Each strategy is isolated and testable
- Clear separation of concerns

## Project-Specific Patterns

### 1. Animated Properties with InterpolatedProperty

All animated values use `InterpolatedProperty<T>` for smooth transitions.

```typescript
class LayoutNode<T> {
  posX: InterpolatedProperty<number>;
  posY: InterpolatedProperty<number>;
  width: InterpolatedProperty<number>;
  height: InterpolatedProperty<number>;
  scale: InterpolatedProperty<number>;
  opacity: InterpolatedProperty<number>;

  setTargets(
    pos: { x: number; y: number },
    size: { w: number; h: number },
    opacity = 1,
    scale = 1
  ): void {
    this.posX.targetValue = pos.x;
    this.posY.targetValue = pos.y;
    this.width.targetValue = size.w;
    this.height.targetValue = size.h;
    this.opacity.targetValue = opacity;
    this.scale.targetValue = scale;
  }
}
```

**Rules:**
- ALWAYS use `InterpolatedProperty` for values that animate
- NEVER directly set values (use `targetValue`)
- Let the interpolation system handle smooth transitions
- Access current value via `.value` property

### 2. Accessors for Polymorphism

Use accessor interfaces to decouple generic components from specific data structures.

```typescript
interface LayoutAccessors<T> {
  groupKey(item: T): string;
  weight?(item: T): number;
  aspect?(item: T): number;
}

interface RenderAccessors<T> {
  label(item: T): string;
  priceText(item: T): string;
}

// Generic component uses accessors
class PivotLayouter<T> {
  constructor(private config: {
    accessors: LayoutAccessors<T>;
    // ...
  }) {}

  private getGroupKey(item: T): string {
    return this.config.accessors.groupKey(item);
  }
}

// Concrete usage
const productAccessors: LayoutAccessors<Product> = {
  groupKey: (p) => p.brand ?? 'Unknown',
  weight: (p) => p.weight ?? 0,
  aspect: (p) => 0.75,
};
```

**Rules:**
- NEVER access properties directly in generic components
- ALWAYS use accessors to get values
- Define separate accessor interfaces for different concerns (layout vs render)
- Accessor functions can be simple property access or complex derivations

### 3. Self-Managed State in Domain Objects

Domain objects (like `Product`) manage their own state and behavior.

```typescript
class Product {
  private static imageCache = new Map<string, HTMLImageElement>();
  private static loadingPromises = new Map<string, Promise<HTMLImageElement>>();

  private _image: HTMLImageElement | null = null;
  private _imageLoading = false;
  private _imageError = false;

  // Public API
  async loadImage(): Promise<HTMLImageElement | null> {
    // Handles caching, loading, error recovery
  }

  async loadImageFromUrl(url: string): Promise<HTMLImageElement | null> {
    // Specific URL loading (used by LOD system)
  }

  get image(): HTMLImageElement | null {
    return this._image;
  }

  get isImageReady(): boolean {
    return !!(this._image && this._image.complete && !this._imageError);
  }
}
```

**Rules:**
- Domain objects manage their own state
- Use static fields for shared state (like caches)
- Provide clear public API (getters, methods)
- Hide implementation details (private fields)
- Handle errors internally, provide graceful fallback

### 4. Configuration Objects for Flexibility

Use configuration objects instead of long parameter lists.

```typescript
// ❌ BAD
class PivotLayouter {
  constructor(
    orientation: 'horizontal' | 'vertical',
    flow: 'rows' | 'columns',
    gapBetweenFrames: number,
    gapWithinFrame: number,
    baseSize: number,
    // ... 10 more parameters
  ) {}
}

// ✅ GOOD
interface PivotConfig<T> {
  orientation: 'horizontal' | 'vertical';
  flow: 'rows' | 'columns';
  gaps: {
    betweenFrames: number;
    withinFrame: number;
  };
  baseSize: number;
  accessors: LayoutAccessors<T>;
  scalePolicy?: ScalePolicy<T>;
  innerLayoutFactory?: () => LayoutStrategy<T>;
}

class PivotLayouter<T> {
  constructor(private config: PivotConfig<T>) {
    // Apply defaults
    this.scalePolicy = config.scalePolicy ?? new NoScalePolicy();
    this.innerLayout = config.innerLayoutFactory?.() ?? new GridLayoutStrategy();
  }
}
```

**Rules:**
- Use config objects for classes with >3 constructor parameters
- Group related parameters into nested objects
- Provide sensible defaults
- Use optional parameters with `??` operator
- Document config interface with JSDoc

### 5. Readonly Domain Data

Domain data should be immutable after construction.

```typescript
class Product {
  public readonly id: string;
  public readonly name: string;
  public readonly brand?: string;
  public readonly category: string[];
  public readonly price?: Price;

  constructor(data: ProductData) {
    this.id = data.id;
    this.name = data.name;
    this.brand = data.brand;
    this.category = data.category ?? [];
    this.price = data.price;
  }
}
```

**Rules:**
- Use `readonly` for all domain data fields
- Initialize in constructor
- Derived values via getters (not stored fields)
- Mutable state only for runtime behavior (like `_image` in Product)

## Code Organization

### Directory Structure

```
src/
├── types/              # Domain models (Product, Price, MediaItem, etc.)
├── layout/             # Layout system
│   ├── LayoutNode.ts
│   ├── LayoutEngine.ts
│   ├── PivotLayouter.ts
│   └── strategies/     # Layout strategies
├── render/             # Rendering system
│   └── CanvasRenderer.ts
├── data/               # Data access
│   └── ProductRepository.ts
├── utils/              # Utilities
│   ├── ViewportTransform.ts
│   └── ImageCache.ts
├── config/             # Configuration
│   └── LODConfig.ts
└── components/         # React components (UI only)
```

**Rules:**
- Separate concerns by directory
- Domain models in `types/`
- Business logic in dedicated directories (layout, render)
- React components are thin wrappers (no business logic)
- Utils for truly reusable utilities only

### File Naming

- **Classes**: `PascalCase.ts` (e.g., `ProductRepository.ts`)
- **Interfaces**: `PascalCase.ts` (e.g., `LayoutAccessors.ts`)
- **Config**: `PascalCase.ts` (e.g., `LODConfig.ts`)
- **Components**: `PascalCase.tsx` (e.g., `ProductFinder.tsx`)
- **Utilities**: `camelCase.ts` (e.g., `formatPrice.ts`)

### Import Organization

```typescript
// 1. External dependencies
import React, { useState, useEffect } from 'react';

// 2. Internal modules (absolute paths via tsconfig)
import { Product } from '@/types/Product';
import { LayoutEngine } from '@/layout/LayoutEngine';
import { CanvasRenderer } from '@/render/CanvasRenderer';

// 3. Relative imports (same directory or subdirectories)
import { LOD_CONFIG } from '../config/LODConfig';
import type { LayoutAccessors } from './types';
```

## TypeScript Best Practices

### 1. Type Safety

**DO**: Use strict type checking
**DON'T**: Use `any` or type assertions unless absolutely necessary

```typescript
// ✅ GOOD
function getProductWeight(product: Product): number | undefined {
  return product.weight;
}

// ❌ BAD
function getProductWeight(product: any): any {
  return product.weight;
}
```

### 2. Nullability

**DO**: Explicitly handle null/undefined
**DON'T**: Use non-null assertions (`!`) without good reason

```typescript
// ✅ GOOD
const weight = product.weight ?? 0;
if (product.image) {
  ctx.drawImage(product.image, x, y, w, h);
}

// ❌ BAD
const weight = product.weight!;
ctx.drawImage(product.image!, x, y, w, h);
```

### 3. Type Inference

**DO**: Let TypeScript infer types when obvious
**DON'T**: Over-annotate

```typescript
// ✅ GOOD
const products = await repository.fetchProducts();  // Type inferred
const count = products.length;  // Type inferred

// ❌ BAD
const products: Product[] = await repository.fetchProducts();
const count: number = products.length;
```

### 4. Prefer Interfaces for Public API

```typescript
// ✅ GOOD - Interface for public contract
interface LayoutAccessors<T> {
  groupKey(item: T): string;
  weight?(item: T): number;
}

// ✅ GOOD - Type for data structures
type ProductData = {
  id: string;
  name: string;
  price?: Price;
};
```

## Performance Considerations

### 1. Avoid Premature Optimization

**DO**: Write clean, maintainable code first
**DON'T**: Optimize before profiling

```typescript
// ✅ GOOD - Clear and maintainable
const visibleNodes = nodes.filter(n => {
  const x = n.posX.value ?? 0;
  const y = n.posY.value ?? 0;
  const w = n.width.value ?? 0;
  const h = n.height.value ?? 0;
  return !(x + w < viewportLeft || x > viewportRight ||
           y + h < viewportTop || y > viewportBottom);
});

// ❌ BAD - "Optimized" but unmaintainable
const visibleNodes = nodes.filter(n =>
  !((n.posX.value ?? 0) + (n.width.value ?? 0) < viewportLeft ||
    (n.posX.value ?? 0) > viewportRight ||
    (n.posY.value ?? 0) + (n.height.value ?? 0) < viewportTop ||
    (n.posY.value ?? 0) > viewportBottom)
);
```

### 2. Cache Expensive Computations

```typescript
class Product {
  private static imageCache = new Map<string, HTMLImageElement>();

  async loadImage(): Promise<HTMLImageElement | null> {
    const url = this.imageUrl;

    // Check cache first
    if (Product.imageCache.has(url)) {
      return Product.imageCache.get(url)!;
    }

    // Load and cache
    const img = await this.loadImageFromUrl(url);
    if (img) {
      Product.imageCache.set(url, img);
    }
    return img;
  }
}
```

### 3. Rate Limit Heavy Operations

```typescript
// LOD system loads images gradually
const LOD_CONFIG = {
  scanInterval: 1000,        // Check what's needed every 1s
  processInterval: 100,      // Load images every 100ms
  maxLoadsPerCycle: 1,       // Only 1 image per cycle
};
```

## Testing Principles

### 1. Test Behavior, Not Implementation

```typescript
// ✅ GOOD - Tests public API
test('Product loads image and makes it available', async () => {
  const product = new Product({ id: '1', name: 'Test' });

  expect(product.isImageReady).toBe(false);

  await product.loadImage();

  expect(product.isImageReady).toBe(true);
  expect(product.image).toBeTruthy();
});

// ❌ BAD - Tests internal state
test('Product sets _imageLoading to true', async () => {
  const product = new Product({ id: '1', name: 'Test' });
  // @ts-ignore - accessing private field
  expect(product._imageLoading).toBe(false);
});
```

### 2. Dependency Injection Enables Testing

```typescript
// Easy to test because dependencies are injected
class CanvasRenderer<T> {
  constructor(
    private ctx: CanvasRenderingContext2D,
    private getNodes: () => LayoutNode<T>[],
    // ...
  ) {}
}

// Test with mock dependencies
test('CanvasRenderer draws all nodes', () => {
  const mockCtx = createMockCanvas2DContext();
  const mockNodes = [createMockNode(), createMockNode()];

  const renderer = new CanvasRenderer(
    mockCtx,
    () => mockNodes,
    mockAccessors
  );

  renderer.draw();

  expect(mockCtx.drawImage).toHaveBeenCalledTimes(2);
});
```

## Common Anti-Patterns to Avoid

### 1. Utility Classes

**❌ AVOID**
```typescript
class ProductUtils {
  static getWeight(product: Product): number {
    return product.weight ?? 0;
  }

  static isExpensive(product: Product): boolean {
    return (product.price?.value ?? 0) > 100;
  }
}
```

**✅ PREFER**
```typescript
class Product {
  get weight(): number {
    return this.specifications?.weight ?? 0;
  }

  isExpensive(): boolean {
    return (this.price?.value ?? 0) > 100;
  }
}
```

### 2. Anemic Domain Model

**❌ AVOID**
```typescript
// Just data, no behavior
interface Product {
  id: string;
  name: string;
  imageUrl: string;
}

// Behavior in separate service
class ProductService {
  loadImage(product: Product): Promise<void> {
    // ...
  }

  isImageReady(product: Product): boolean {
    // ...
  }
}
```

**✅ PREFER**
```typescript
// Rich domain model with behavior
class Product {
  private _image: HTMLImageElement | null = null;

  async loadImage(): Promise<HTMLImageElement | null> {
    // Object manages its own behavior
  }

  get isImageReady(): boolean {
    return !!(this._image && this._image.complete);
  }
}
```

### 3. God Objects

**❌ AVOID**
```typescript
class ProductFinderApp {
  loadProducts() { /* ... */ }
  renderCanvas() { /* ... */ }
  handleUserInput() { /* ... */ }
  updateLayout() { /* ... */ }
  manageCache() { /* ... */ }
}
```

**✅ PREFER**
```typescript
// Separate responsibilities
class ProductRepository { loadProducts() }
class CanvasRenderer { render() }
class InputHandler { handleInput() }
class LayoutEngine { layout() }
class ImageCache { get/set }
```

### 4. Primitive Obsession

**❌ AVOID**
```typescript
function calculatePrice(
  basePrice: number,
  currency: string,
  taxRate: number,
  discount: number
): number {
  // ...
}
```

**✅ PREFER**
```typescript
class Price {
  constructor(
    public readonly value: number,
    public readonly currency: string
  ) {}

  applyTax(rate: number): Price {
    return new Price(this.value * (1 + rate), this.currency);
  }

  applyDiscount(amount: number): Price {
    return new Price(this.value - amount, this.currency);
  }

  get formatted(): string {
    return `${this.value.toFixed(2)} ${this.currency}`;
  }
}
```

## Documentation Standards

### 1. JSDoc for Public API

```typescript
/**
 * Manages the layout of items in a pivot-style arrangement.
 *
 * Groups items by a configurable key and arranges them in rows or columns.
 * Each group is laid out using a configurable inner layout strategy.
 *
 * @template T The type of items being laid out
 *
 * @example
 * ```typescript
 * const layouter = new PivotLayouter<Product>({
 *   orientation: 'horizontal',
 *   flow: 'columns',
 *   gaps: { betweenFrames: 40, withinFrame: 8 },
 *   baseSize: 120,
 *   accessors: productAccessors,
 * });
 *
 * layouter.compute(nodes, viewport);
 * ```
 */
export class PivotLayouter<T> {
  /**
   * Computes layout positions for all nodes based on current viewport.
   *
   * @param nodes - The layout nodes to position
   * @param view - The current viewport dimensions
   */
  compute(nodes: LayoutNode<T>[], view: { width: number; height: number }): void {
    // ...
  }
}
```

### 2. Inline Comments for Complex Logic

```typescript
// Calculate priority based on distance from viewport center
// Lower distance = higher priority = loads first
const centerX = (viewportLeft + viewportRight) / 2;
const centerY = (viewportTop + viewportBottom) / 2;
const nodeCenterX = x + w / 2;
const nodeCenterY = y + h / 2;
const distanceFromCenter = Math.sqrt(
  Math.pow(nodeCenterX - centerX, 2) + Math.pow(nodeCenterY - centerY, 2)
);
```

### 3. Architecture Documentation

Create dedicated docs for complex systems (see `docs/LOD_SYSTEM.md`).

## Code Review Checklist

Before submitting code, verify:

- [ ] **OOP Principles**: Classes encapsulate state and behavior
- [ ] **Single Responsibility**: Each class has one clear purpose
- [ ] **Dependency Injection**: Dependencies passed via constructor
- [ ] **Type Safety**: No `any` types, proper null handling
- [ ] **Immutability**: Domain data is `readonly`
- [ ] **Encapsulation**: Private fields, public API via methods/getters
- [ ] **Generics**: Reusable components use generics
- [ ] **Configuration**: Complex classes use config objects
- [ ] **Testing**: Code is testable (dependencies injected)
- [ ] **Documentation**: Public API has JSDoc comments
- [ ] **Performance**: No obvious performance issues
- [ ] **Naming**: Clear, descriptive names following conventions
- [ ] **Organization**: Files in correct directories

## Summary

This project follows **true Object-Oriented Programming** principles:

1. **Encapsulation**: Objects manage their own state
2. **Single Responsibility**: Each class has one clear purpose
3. **Dependency Injection**: Flexible, testable components
4. **Generics**: Type-safe, reusable code
5. **Strategy Pattern**: Configurable behavior
6. **Rich Domain Models**: Behavior with data, not separate

Follow these principles to maintain code quality and consistency across the project.
