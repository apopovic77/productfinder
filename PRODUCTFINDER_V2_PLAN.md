# ProductFinder v2 — Implementierungsplan

**Basis:** Arcturian 3D Engine (Git Submodule `libs/arcturian/`)
**Repo:** `/var/code/productfinder/` Branch `dev`
**Route:** `/v2` (v1 bleibt auf `/*`)

---

## Architektur

```
Arcturian Engine (libs/arcturian/src/engine/)
├── MorphShader        → Vertex/Fragment + Uniforms
├── Tessellation       → 9 Layout-Shapes (Sphere, Ring, Gallery, Box...)
├── AtlasRegistry      → Atlas LOD Management
├── LodManager         → On-Demand LOD 2 Loading
├── SmoothZoomControls → Camera Pan/Zoom mit Fly-To
└── ClickPicker        → Doppelklick Raycasting

ProductFinder v2 (src/v2/)
├── GPANE Engine       → Pivot Analysis + Taxonomy (reuse v1)
├── PivotLayouter      → Bucket-Grid Positionen (reuse v1)
├── PivotLayoutAdapter → Layout → GPU Buffer Bridge
├── MultiTierAtlas     → 3-Tier Dynamic Canvas Atlas
├── Zustand Store      → UI State + Navigation
├── HTML Overlays      → Bucket Headers, Tooltip, V4 Dialog
└── V2 Controller      → Orchestrierung
```

---

## 1. Texture Atlas System (3-Tier LOD)

### Tier-Konfiguration

| Tier | Tile Size | Atlas Canvas | Tiles/Atlas | Atlases | Max Produkte | GPU Memory |
|------|-----------|-------------|-------------|---------|-------------|------------|
| T0   | 64×64     | 4096×4096    | 4096        | 1       | 4096        | ~64 MB     |
| T1   | 128×128   | 4096×4096    | 1024        | 2       | 2048        | ~128 MB    |
| T2   | 256×256   | 4096×4096    | 256         | 8       | 2048        | ~512 MB    |

**Budget:** Max ~256 MB aktiv (1×T0 + 2×T1 + 3 aktive T2). T2 wird recycled.
**Mobile:** Nur T0+T1 (~192 MB), kein T2.

### Dateien

```
src/v2/render/MultiTierAtlas.ts     — 3-Tier Atlas mit Slot-Allocator
src/v2/render/ImageLoadPipeline.ts  — Priorisierte async Bildladung
```

### Lade-Strategie

- **T0 (64px):** Sofort für alle sichtbaren Produkte (Startup)
- **T1 (128px):** Wenn Screensize > 100px (Browse-Modus)
- **T2 (256px):** Wenn Screensize > 300px (Zoom-In, on-demand)
- **1300px:** Nur für HTML V4 Detail-Dialog (separates `<img>`)
- Concurrency: Max 4 gleichzeitige Fetches
- Quality: T0=60, T1=75, T2=85

### LOD Switch im Shader

Per-Instance `aAtlasPage` Attribut + `aUVOffset` Update bei Tier-Wechsel.
Kein Branching im Shader — CPU tauscht UV-Daten aus.

---

## 2. Layout System

### Reuse v1 PivotLayouter

V1's `PivotLayouter` und `LayoutEngine` werden **direkt wiederverwendet**.
Output: `LayoutNode<Product>` mit `posX.targetValue`, `posY.targetValue`, `width.targetValue`, `height.targetValue`.

### PivotLayoutAdapter (Enhanced)

```typescript
// Mapping: LayoutNode → GPU Attribute
aLayout.setXYZW(i, node.posX.targetValue, node.posY.targetValue, 0, scale);
aTarget.setXYZW(i, node.width.targetValue, node.height.targetValue, 0, 0);
aQuaternion.setXYZW(i, 0, 0, 0, 1); // Identity (2D)
```

Neue Methode: `applyFromLayoutEngine(engine: LayoutEngine<Product>, atlas: MultiTierAtlas)`

### Drill-Down Transitions

1. Copy `aLayout` → `aOldLayout`, `aTarget` → `aOldTarget`
2. GPANE drill → neuer PivotLayouter compute → neue Positionen in `aLayout`
3. `uLayoutMix` 0→1 via `useFrame` (oder GSAP)
4. Stagger: `aAnimOffset` = `distance(pos, clickPoint) * 0.002` (Wave)

### Appear/Disappear

- Erscheinen: `aOldLayout.w = 0` (Scale 0), `aLayout.w = 1` → wächst
- Verschwinden: `aLayout.w = 0` → schrumpft zu Null
- Nach Transition: `mesh.count = newCount`

### Hero Mode

- `GpanePivotService.isHeroModeActive()` → Switch zu `HeroLayouter`
- Große Produktdarstellung, horizontal zentriert
- Smooth Transition Scale-Up via `uLayoutMix`

---

## 3. GPANE Integration

### Reuse komplett

- `GPANEEngine` — Taxonomy + Auto-Scoring
- `GpanePivotService` — Wrapper mit Drill/Focus API
- `ONEAL_TAXONOMY` — Shop-Navigation
- Keine Änderungen an GPANE nötig

### Zustand Store

```
src/v2/store/useProductFinderStore.ts
```

```typescript
interface ProductFinderState {
  products: Product[];
  loading: boolean;
  breadcrumbs: string[];
  activeDimension: string | null;
  availableDimensions: ScoredDimension[];
  heroMode: boolean;
  buckets: Bucket[];
  hoveredProductId: string | null;
  selectedProduct: Product | null;

  loadProducts: () => Promise<void>;
  drillDown: (bucketLabel: string) => void;
  drillUp: () => void;
  reset: () => void;
  selectDimension: (key: string) => void;
}
```

### Datenfluss

```
API → Product[]
  → GpanePivotService.loadProducts()
  → filterProducts() → Bucket[]
  → LayoutEngine.sync(filtered)
  → PivotLayouter.compute(nodes, view)
  → PivotLayoutAdapter.applyFromLayoutEngine()
  → GPU Buffer Update → Shader rendert
```

---

## 4. Interaction

### Hit Testing

- CPU Screen-Space Hit-Test (wie aktueller PoC)
- Optimierung: Spatial Hash (64×64px Zellen) für O(1) statt O(N)
- `SpatialHash.rebuild()` nach Layout/Camera-Änderung

```
src/v2/render/SpatialHash.ts
```

### Camera

- Arcturian `SmoothZoomControls` (Ortho, kein Rotate)
- Content Bounds von `LayoutService.getContentBounds()`
- Fly-to-Product bei Klick via `flyTargetRef`
- Fallback: drei `MapControls` falls Submodule-Integration hakt

---

## 5. HTML Overlay Layer

```
src/v2/overlays/
├── OverlayLayer.tsx       — Container (absolute, pointer-events: none)
├── BucketHeaders.tsx      — Projizierte Bucket-Labels
├── ProductTooltip.tsx     — Hover-Tooltip (Name, Preis)
├── Breadcrumbs.tsx        — Navigation Trail
└── DimensionPicker.tsx    — Dimension Switch UI
```

### Bucket Headers

- World-Position → Screen-Position via `camera.project()`
- `pointerEvents: auto` für Klick → `store.drillDown(key)`
- Style: ITC Avant Garde Gothic, dark theme, Background-Image

### V4 Detail Dialog

- Reuse `ProductOverlayModalV4` aus v1
- Trigger: `store.selectedProduct` gesetzt
- 1300px Bild wird separat als `<img>` geladen (nicht im Atlas)

---

## 6. Dateistruktur

```
src/v2/
  ProductFinderV2.tsx              — Root (Canvas + Overlay)
  ProductFinderScene.tsx           — R3F Scene (InstancedMesh)

  controller/
    ProductFinderV2Controller.ts   — Orchestrierung

  store/
    useProductFinderStore.ts       — Zustand State

  render/
    MultiTierAtlas.ts              — 3-Tier LOD Atlas
    ImageLoadPipeline.ts           — Async Bild-Loading
    PivotLayoutAdapter.ts          — Layout → GPU Bridge (enhanced)
    SpatialHash.ts                 — Hit-Test Beschleunigung

  shaders/
    productfinder.vert             — Multi-Atlas Vertex Shader
    productfinder.frag             — Multi-Atlas Fragment Shader

  overlays/
    OverlayLayer.tsx               — HTML Overlay Container
    BucketHeaders.tsx              — Bucket Header Labels
    ProductTooltip.tsx             — Hover Tooltip
    Breadcrumbs.tsx                — Navigation
    DimensionPicker.tsx            — Dimension Picker

  hooks/
    useLayoutSync.ts               — Store → Layout → GPU Hook
    useCameraProjection.ts         — World → Screen Projection
```

---

## 7. Implementierungsreihenfolge

### Phase 1: Foundation (Tag 1–3)

**Tag 1: Submodule + Setup**
- `git submodule update --init`
- `@arcturian/*` Alias verifizieren (tsconfig + vite)
- v2 Verzeichnisstruktur anlegen
- Build verifizieren

**Tag 2: Zustand Store + GPANE**
- `useProductFinderStore.ts` mit komplettem State
- `ProductFinderV2Controller.ts` wrapping GpanePivotService
- Produkte laden, GPANE initialisieren
- Buckets, Breadcrumbs, Dimensions im Store

**Tag 3: Layout Bridge**
- `V2LayoutService` mit PivotLayouter + LayoutEngine (reuse v1)
- Enhanced `PivotLayoutAdapter.applyFromLayoutEngine()`
- Test: Echte Bucket-Grid Positionen statt PoC-Grid

### Phase 2: Atlas & LOD (Tag 4–6)

**Tag 4: MultiTierAtlas**
- 3 Tiers (64/128/256) mit Slot-Allocator
- Canvas-basierte Atlas-Pages (4096×4096)
- Placeholder Rendering

**Tag 5: ImageLoadPipeline**
- Priority Queue (Screen-Space Size)
- T0 → T1 → T2 on-demand
- Concurrency Limit

**Tag 6: Multi-Atlas Shader**
- Per-Instance `aAtlasPage` Attribut
- Fragment Shader mit Atlas-Array Sampling
- LOD Switch verifizieren

### Phase 3: Navigation & Transitions (Tag 7–9)

**Tag 7: Drill-Down**
- `store.drillDown()` → GPANE → Re-Layout → GPU Buffer Swap
- `uLayoutMix` Animation 0→1
- Basis-Drill funktioniert

**Tag 8: Stagger + Appear/Disappear**
- `aAnimOffset` Wave-Animation
- Scale 0→1 / 1→0 für neue/alte Produkte
- Drill-Up (Reverse)

**Tag 9: Hero Mode**
- Hero Detection von GPANE
- HeroLayouter Integration
- Transition Pivot → Hero → Pivot

### Phase 4: HTML Overlays (Tag 10–12)

**Tag 10: Bucket Headers + Breadcrumbs**
- World → Screen Projection
- Styled Bucket Buttons
- Breadcrumb Navigation

**Tag 11: Tooltip + Hit Testing**
- SpatialHash für schnelles Hit Testing
- Hover Tooltip (Name, Preis)
- Cursor Change

**Tag 12: V4 Detail Dialog**
- ProductOverlayModalV4 Integration
- 1300px Bild separat laden
- Full Flow: Hover → Click → Dialog → Close

### Phase 5: Camera & Polish (Tag 13–15)

**Tag 13: Camera**
- Arcturian SmoothZoomControls
- Content Bounds + Rubberband
- Fly-to-Product Animation

**Tag 14: Mobile + Dimension Picker**
- Responsive: Columns → Rows
- Touch: Tap/Pinch/Swipe
- DimensionPicker UI

**Tag 15: Integration Test**
- 2000 Produkte Volltest
- GPU Memory Profiling (<300MB)
- 60fps Desktop, 30fps Mobile
- Edge Cases (leere Buckets, schnelles Klicken)

### Phase 6: Arcturian Deep Integration (Tag 16–17, optional)

**Tag 16:** MorphShader Integration (Engine-eigene Transitions statt custom uLayoutMix)
**Tag 17:** ClickPicker für GPU-accelerated Hit Testing

---

## 8. Risiken

| Risiko | Mitigation |
|--------|------------|
| Submodule baut nicht | PoC funktioniert ohne Arcturian — custom Shader behalten |
| GPU Memory Mobile | Nur T0+T1 auf Mobile (~192MB), kein T2 |
| Y-Achse invertiert | Vertex Shader kompensiert (pos.y -= size.y * 0.5) |
| Schnelles Multi-Drill | `transitioning` Flag, Queue + Cancel |
