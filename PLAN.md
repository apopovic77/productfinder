# Product Finder – Pivot Layout Implementation Plan

This plan defines the steps to implement a canvas‑based Pivot layout using the Oneal API, reusing `Vector2` and `InterpolatedProperty` from 3dPresenter2.

## Goals
- Bottom‑aligned pivot/shelf layout (rows or columns) with smooth animations.
- Product‑internal relative sizing (weight → scale) for skyline effect.
- Clean OOP: `Product`, `LayoutNode<T>`, `LayoutEngine<T>`, `PivotLayouter<T>`, `GridLayoutStrategy<T>`.
- Canvas renderer; data from Oneal API.

## Architecture
- Data: Oneal API → `ProductRepository`
- Domain: `Product` (+ accessors)
- Runtime: `LayoutNode<Product>` (pos/size/opacity/scale via `InterpolatedProperty`)
- Accessors: `ProductLayoutAccessors`, `ProductRenderAccessors`
- Scale: `WeightScalePolicy<Product>` (min/max weight → scale)
- Layout: `PivotLayouter<Product>` with Frames + `GridLayoutStrategy`
- Engine: `LayoutEngine<Product>`
- Render: `CanvasRenderer<Product>` + `ImageCache`

## Module Map (aliases ready)
- `@presenter/Vector2` → 3dPresenter2/src/engine/types/Vector2.ts
- `@presenter/InterpolatedProperty` → 3dPresenter2/src/engine/properties/InterpolatedProperty.ts

## Implementation Steps

1) Product model
- [ ] Create `Product` class mirroring API fields.
- [ ] Helpers: `previewUrl(role?)`, `weightGr()`, `sizeHint()`, `layoutKey(strategy?)`.

2) Accessors
- [ ] `ProductLayoutAccessors`: `groupKey`, `weight`, `aspect|sizeHint`.
- [ ] `ProductRenderAccessors`: `label`, `imageUrl`, `priceText`.

3) Scale policy
- [ ] `ScaleContext { weightMin, weightMax, clampMin, clampMax }`.
- [ ] `WeightScalePolicy<Product>.computeScale(product, ctx)`.

4) Layout runtime
- [ ] `LayoutNode<T>`: `id`, `data`, `pos: IP<Vector2>`, `size: IP<Vector2>`, `opacity: IP<number>`, `scale: IP<number>`, `zIndex`.
- [ ] `setTargets(pos, size, opacity?, scale?)`, `hitTest(Vector2)`.

5) Engine
- [ ] `LayoutEngine<T>`: `sync(items, idOf)`, `layout(view)`, `all()`.

6) Pivot layout
- [ ] `PivotConfig<T>`: orientation, flow, gaps, base size, `groupKey/sort`, `access`, `scale`, `innerFactory`.
- [ ] `PivotLayouter<T>.compute(nodes, view)`:
  - group nodes → Frames (Row/Column)
  - for each Frame: inner layout → set node targets

7) Inner layout – Grid (BorderIn‑like)
- [ ] `GridLayoutStrategy<T>`:
  - derive uniform `cellLen` so `(cols*cellLen + gap*(cols-1) ≤ frameLen)`
  - visual size per item: `h = base*scale`, `w = h*aspect`
  - pack left→right; bottom‑align (columns) / baseline (rows)
  - set `node.pos/size.targetValue`, `zIndex`

8) Renderer
- [ ] `CanvasRenderer` draws `LayoutEngine.all()` nodes via current `pos/size`.
- [ ] Labels/price via `RenderAccessors`.

9) Repository (Oneal API)
- [ ] `fetchProducts(query, limit)` → `Product` list
- [ ] `fetchFacets()` for filter UI
- [ ] Env: `VITE_ONEAL_API_BASE`, `VITE_ONEAL_API_KEY`

10) UI wiring
- [ ] Toolbar → `Query` → repo → engine.sync → engine.layout → renderer.render
- [ ] Filters: search/category/season/price/weight

## Acceptance
- [ ] 500–1000 products render smoothly (~60fps desktop)
- [ ] Visible skyline from weight scaling
- [ ] Grouping switch (brand/category) updates frames correctly
- [ ] Smooth transitions of pos/size
- [ ] Facets filters work

## Performance Notes
- ImageCache, text metric caching
- Resize‑aware canvas sizing; throttle off‑screen

## Stretch (later)
- RankedGridLayoutStrategy (ranked sizes like Sense/KIS)
- DOM Group header overlay
- FieldAware layout
- Resolved media variants via Storage API
