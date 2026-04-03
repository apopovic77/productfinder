# ProductFinder — Architektur-Dokumentation

**Stand:** 2026-04-03
**Repo:** `apopovic77/productfinder` Branch `dev`
**Dev-Verzeichnis:** `/var/code/productfinder/`

---

## Übersicht

Der ProductFinder ist ein visuelles Produkt-Explorationstool für O'Neal (Motocross/MTB Equipment). Er rendert ~2600 Produkte in interaktiven Layouts mit Pivot-Navigation.

### Drei Versionen

| Version | Route | Renderer | Status |
|---------|-------|----------|--------|
| **v1** | `/` | Canvas 2D (`CanvasRenderer.ts`) | Production, stabil |
| **v1 + Arcturian** | `/?renderer=arcturian` | Three.js GPU Instanced (`ArcturianRenderer.tsx`) | Experimentell |
| **v3** | `/v3` | Arcturian Engine pur (3D Shapes) | Demo/Playground |

---

## Kern-Architektur (v1)

```
App.tsx (React Class Component)
  │
  ├── ProductFinderController.ts — Orchestrierung
  │     ├── LayoutService.ts — Layout-Berechnung
  │     │     ├── GpanePivotService.ts — GPANE Wrapper
  │     │     │     └── GPANEEngine (engine.ts) — Pivot-Analyse + Taxonomy
  │     │     ├── LayoutEngine.ts — Node-Pool mit InterpolatedProperty
  │     │     └── PivotLayouter.ts — Bucket-Grid Positionen
  │     ├── FilterService.ts — Text/Preis/Saison Filter
  │     ├── FavoritesService.ts — Favoriten
  │     └── ViewportService.ts — Pan/Zoom/Bounds
  │
  ├── CanvasRenderer.ts — 2D Canvas Draw Loop
  │     ├── LOD Scanner (3-tier: 35/130/1300px)
  │     ├── ImageLoadQueue — Priorisierte Bild-Ladung
  │     └── ProductLabelRenderer.ts — Text auf Canvas
  │
  └── ArcturianRenderer.tsx — Alternative: GPU Instanced (Three.js)
        ├── Arcturian MorphShader — via onBeforeCompile
        ├── AtlasRegistry + LodManager — 3-tier LOD (64/128/256)
        ├── SmoothMouseCamera — Pan/Zoom/Orbit
        ├── ParticleAnimator — Einzelpartikel-Animation
        └── BucketButtons — 3D Text-Planes
```

---

## GPANE Engine

**Generic Pivoting & Adaptive Navigation Engine**

Analysiert Produkteigenschaften automatisch und scored Pivot-Dimensionen.

### Dateien

```
src/gpane/
├── engine.ts            — GPANEEngine: Taxonomy + GPANE Modus
├── GpanePivotService.ts — Wrapper für LayoutService API
├── analyzer.ts          — Property-Analyse (Coverage, Cardinality, Entropy)
├── scorer.ts            — Dimensions-Scoring (7 Faktoren)
├── bucketer.ts          — Bucket-Bildung (Categorical, Range, Discrete, Boolean)
├── detection.ts         — Datentyp-Erkennung
├── oneal-taxonomy.ts    — O'Neal Shop Navigation Tree
├── types.ts             — Interfaces + GPANEConfig
└── index.ts             — Exports
```

### Modus-Wechsel

```
Start → Taxonomy Mode (Shop-Navigation: MX → Helme → Fullface)
  │
  ├── Tree endet → Auto-Switch zu GPANE Mode (scored Dimensionen)
  ├── User wählt Dimension → GPANE Mode
  └── User klickt Zurück → Taxonomy Mode (wenn möglich)
```

### Dokumentation

- **Post #468** — GPANE Vollständige Spezifikation
- **Post #469** — GPANE Algorithmen-Dokumentation
- **GPANE_SPEC.md** — Lokale Kopie der Spec
- **GPANE_ALGORITHMS.md** — Lokale Kopie der Algorithmen
- **`/doku` Route** — Interaktive Web-Dokumentation

---

## Arcturian Engine Integration

### Submodule

```
libs/arcturian/ → github.com/apopovic77/Arcturian (Branch: dev)
```

**Update:** `cd libs/arcturian && git pull origin dev`

### Path Alias

```
tsconfig.app.json: "@arcturian/*" → "./libs/arcturian/src/engine/*"
vite.config.ts:    "@arcturian"   → libs/arcturian/src/engine
```

### Engine Module

```
libs/arcturian/src/engine/
├── core/
│   ├── types.ts           — MorphConfig, LayoutShape, AtlasEntry, FlyTarget
│   ├── MorphShader.ts     — Vertex/Fragment Shader + Uniforms
│   └── ParticleAnimator.ts — Einzelpartikel GPU-Animation
├── tessellation/
│   ├── layouts.ts         — 13 Layout Shapes (sphere, gallery, helix, dna...)
│   └── tessellation.ts    — Geometrie-Generierung
├── atlas/
│   ├── AtlasRegistry.ts   — Atlas LOD Registry
│   └── LodManager.tsx     — LOD 2 On-Demand Loader
└── camera/
    ├── CameraLight.tsx    — Kamera-folgendes Licht
    ├── SmoothZoomControls.tsx — Zoom + Fly-To
    └── ClickPicker.tsx    — Doppelklick Raycasting
```

### Referenz-Dokumentation

- **Post #460** — Arcturian Engine Doku
- **Post #461** — ProductFinder Integration Guide
- **Post #462** — Integration Quickstart für AI Agents

---

## Texture Atlas System

### Generierung

```bash
/var/code/oneal-api-v2/venv/bin/python scripts/generate_atlas.py \
  --format png --output atlas/
```

### Tiers

| Tier | Tile Size | Grid | Tiles/Page | Pages | GPU Memory |
|------|-----------|------|------------|-------|------------|
| T0 | 64×64 | 64×64 | 4096 | 1 | ~64 MB |
| T1 | 128×128 | 32×32 | 1024 | 3 | ~64 MB × 3 |
| T2 | 256×256 | 16×16 | 256 | 11 | ~64 MB × on-demand |

### Dateien

```
atlas/
├── 64/atlas_0.png          — LOD 0 (alle 2603 Produkte)
├── 128/atlas_0..2.png      — LOD 1 (3 Pages)
├── 256/atlas_0..10.png     — LOD 2 (11 Pages, on-demand)
├── jpg/128/atlas_0..2.jpg  — JPG Variante (weißer BG)
└── manifest.json           — Produkt → Tile Mapping
```

### LOD Switching (Arcturian Engine)

```
Kamera weit weg → LOD 0 (64px, 1 Atlas)
Kamera näher    → LOD 1 (128px, Shader switched via uLodThreshold)
Kamera nah      → LOD 2 (256px, LodManager lädt on-demand)
```

---

## ArcturianRenderer (`/?renderer=arcturian`)

### Aktivierung

URL Parameter `?renderer=arcturian` → v1 App mit GPU Renderer statt Canvas.

### Was passiert

1. `App.tsx` checkt `useArcturianRenderer()`
2. `controller.skipCanvasRenderer = true` → kein CanvasRenderer, kein LOD Scanner
3. `<ArcturianRendererComponent>` wird statt `<canvas>` gemountet
4. Liest `LayoutNode[]` vom Controller per `useFrame` (60fps)
5. Schreibt Positionen in GPU Buffer (`aLayout`, `aTarget`, etc.)
6. Arcturian MorphShader rendert via `onBeforeCompile`

### Kamera-Steuerung (SmoothMouseCamera)

- **Links-Drag:** Pan (XY Translation)
- **Mittlere Maustaste:** Orbit (Kamera rotiert um Content-Center)
- **Scroll:** Zoom zur Mausposition
- **Doppelklick:** Fly-To Produkt + ParticleAnimator

### Bekannte Einschränkungen

- Animation läuft auf CPU (InterpolatedProperty), nicht GPU (uLayoutMix)
- Gelegentliche Frame-Drops (Buffer-Write + LOD Load)
- Alpha-Transparenz hat Sortierungsprobleme (OIT nicht implementiert)

---

## v3 (`/v3`)

Pure Arcturian Engine Demo — keine GPANE Navigation, nur 3D Shapes.

### Features

- 13 Layout Shapes (gallery, sphere, ring, helix, dna, galaxy, hexgrid...)
- Shape-Buttons + Sliders (Size, Gap, Aspect, Depth)
- Style Presets (Flat/Cards/Tiles/Blocks)
- PNG/JPG Atlas Toggle
- Tile Color Picker
- Arcturian SmoothZoomControls + ClickPicker
- AtlasRegistry + LodManager (3-tier LOD)
- Smooth Shape-Transitions via uLayoutMix

---

## Deployment

### CI/CD

```
dev Branch → Push → Dev CI
main Branch → Push → GitHub Actions (deploy-gsg.yml)
  → Build auf GitHub Runner
  → SSH zu arkturian → SSH zu aiserver
  → git pull + npm build + rsync
  → rsync dist → arkturian nginx
```

### Server

| Was | Wo |
|-----|-----|
| Dev Code | `/var/code/productfinder/` (aiserver) |
| Deployed Site | `/var/www/productfinder/site/` (aiserver) |
| Nginx (extern) | `gsgbot.arkturian.com/productfinder/` (arkturian) |
| Dev Server | `productfinder-dev.oneal.arkturian.com` (aiserver:5173) |
| Storage API | `127.0.0.1:8001` (aiserver) → Tunnel → `gsgbot.arkturian.com/storage-api` |
| O'Neal API | `127.0.0.1:8004` (aiserver) → Tunnel → `gsgbot.arkturian.com/oneal-api` |

### Release

```bash
cd /var/code/productfinder
bash .devops/scripts/release.sh --no-build
```

### Dev Server starten

```bash
cd /var/code/productfinder
npx vite --host 127.0.0.1 --port 5173
```

---

## Abhängigkeiten

### ProductFinder

- React 18 + TypeScript
- framer-motion (Animationen)
- arkturian-oneal-sdk (API Client)
- arkturian-typescript-utils (InterpolatedProperty, Vector2)
- three + @react-three/fiber + @react-three/drei (nur für Arcturian Renderer)

### Arcturian Engine (Submodule)

- three >=0.160
- @react-three/fiber ^8.x
- @react-three/drei ^9.x
- zustand ^4.x

---

## Datenfluss

### Produkte laden

```
O'Neal API (localhost:8004)
  → fetchProducts() (ProductRepository.ts)
  → Product[] (OOP Klasse mit Attributes, Media, Variants)
  → Controller.onDataChanged()
  → FilterService.filterAndSort()
  → GpanePivotService.loadProducts() → GPANE Engine
  → LayoutEngine.sync() → LayoutNode Pool
  → PivotLayouter.compute() → Positionen
  → CanvasRenderer.draw() ODER ArcturianRenderer.useFrame()
```

### Pivot Drill-Down

```
User klickt Bucket Header
  → drillDownPivot(key)
  → GpanePivotService.drillDown(value)
  → GPANE Engine: focusBucket() oder taxonomyDrillDown()
  → filterProducts() → neue Produktliste
  → LayoutEngine.sync() mit neuen Produkten
  → PivotLayouter.compute() → neue Positionen
  → Animation: InterpolatedProperty (CPU) oder uLayoutMix (GPU)
```

---

## Offene Punkte

- [ ] GPU-Transitions statt CPU InterpolatedProperty
- [ ] ParticleAnimator Shader-Integration (Zielscheiben-Animation)
- [ ] Alpha-Transparenz Sortierung (OIT)
- [ ] Arcturian Engine: AtlasController (kein manuelles Uniform-Setup)
- [ ] Bucket-Buttons: Text-Rendering in der Engine
- [ ] Mobile Touch-Support für Arcturian Renderer
- [ ] v3 → v1 Feature-Parität (GPANE Navigation in 3D)
