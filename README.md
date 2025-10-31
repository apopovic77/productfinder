# ProductFinder

A React TypeScript application for browsing and filtering O'Neal products with an intelligent shelf-style layout system.

## Features

- 🎯 **Smart Product Layout** - Pivot-based layout with configurable grouping strategies
- 📊 **Weight-Based Scaling** - Products scale based on their weight for visual hierarchy
- 🔍 **Advanced Filtering** - Search, category, season, price range, and weight filters
- 🎨 **Canvas Rendering** - High-performance rendering with image caching
- 🔄 **Smooth Animations** - Interpolated properties for position, size, and opacity
- 📱 **Responsive Design** - Adapts to different viewport sizes

## Annotation Tester (`/annot`)

Die Annotation-Testseite validiert die KI-gestützte Produktanalyse, die aus dem `storage-api` stammt. Sie dient dazu, Vision-Analysen end-to-end auszulösen, Prompts/Antworten einzusehen und die erzeugten Anchor-Anmerkungen im Canvas zu prüfen.

### Funktionsumfang

- 🔑 **Tenant-Aware Auth** – Eingabe eines `Storage Object ID` + API-Key (Standard: `oneal_demo_token`).
- 🖼 **Bildvorschau** – Holt das passende Derivat (`/storage/media/{id}`) oder `webview_url` vom Storage-Service.
- 🤖 **Analyse-Trigger** – Startet `POST /storage/analyze-async/{id}` mit konfigurierbaren Parametern:
  - `mode=quality`
  - `ai_tasks=vision,embedding,kg`
  - `ai_vision_mode` (`product` | `generic` | `auto`)
  - `ai_context_role` (`product` | `lifestyle` | …)
  - optional `ai_metadata` (JSON prompt context)
- 🔁 **Task Polling** – Überwacht den Async-Task via `/storage/tasks/{task_id}` bis `completed/failed`.
- 🧠 **Transparenz** – Zeigt Prompt, rohe KI-Antwort, Annotation-JSON und vollständige Objekt-Metadaten (`ai_context_metadata`) inline.
- 📍 **Canvas Overlay** – Visualisiert `annotations[].anchor` als relative x/y-Marker inklusive Tooltip und optionale Bounding Boxes.

### Bedienung

1. Seite öffnen: `http://localhost:5173/annot`
2. `Storage Object ID` (z. B. `4642`) eintragen
3. API-Key prüfen/ersetzen
4. Optional Metadaten-JSON ergänzen (z. B. Produktfeatures)
5. **Load Image** → lädt Objekt + Bild
6. **Start Analysis** → triggert Async-Pipeline und pollt Status
7. Nach Abschluss erscheinen Prompt, Antwort, Annotationen & Metadaten sowie Overlays im Bild
8. **Fetch Annotations** (falls nur Annotationen aktualisiert werden sollen)

### Pipeline-Überblick

```
AnnotationTester → POST /storage/analyze-async/{id}
  → storage-api AsyncPipelineManager
    → ai_analysis.service.analyze_content (Gemini Vision Prompting)
    → Speichert Ergebnisse in storage_objects.ai_context_metadata
    → Knowledge-Graph Schritt (optional embeddings/relations)
AnnotationTester ← GET /storage/tasks/{task_id}
AnnotationTester ← GET /storage/objects/{id} (Prompt/Response)
AnnotationTester ← GET /storage/objects/{id}/annotations
```

### Testing & Automation

- Playwright Test: `tests/annotation.spec.ts`
  ```bash
  ANNOT_OBJECT_ID=4642 ANNOT_API_KEY=oneal_demo_token npx playwright test --project=chromium tests/annotation.spec.ts
  ```
- Interaktiver UI-Test: `npm run test:ui` → Projekt `Annotation Tester` auswählen
- Reporter: `npx playwright show-report`

### Offene Arbeiten / Roadmap

- 🔄 **Annotation Refinement** – Prompting weiter schärfen (z. B. confidence-thresholding, Label-Harmonisierung).
- 📦 **ProductFinder-Integration** – Überführung der Annotationen in reguläre Produkt-Detail-Overlays und Pivot-Dimensionen.
- 🧪 **E2E Upload Tests** – Automatisierte Szenarien: Upload → Analyse → Annotation-Visualisierung.
- 📊 **Insights Export** – Optionale Speicherung der KI-Prompt/Responses für Auditing & Training.
- 🔐 **Key Management** – UI-Option für alternative Tenant-Keys und sichere Speicherung.

## Tech Stack

- **React 18** + **TypeScript**
- **Vite** - Build tool and dev server
- **Canvas API** - High-performance rendering
- **O'Neal API** - Product data source

## Development

### Prerequisites

- Node.js 20+
- npm

### Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Copy `.env.example` to `.env` and configure API endpoints:
   ```bash
   cp .env.example .env
   ```

4. Start the development server:
   ```bash
   npm run dev
   ```

5. Open [http://localhost:5173](http://localhost:5173)

### Build

```bash
npm run build
```

The built files will be in the `dist/` directory.

## Deployment

This project uses GitHub Actions for CI/CD deployment to arkturian.com.

### GitHub Secrets Required

Configure these secrets in your GitHub repository (Settings → Secrets and variables → Actions):

```
DEPLOY_HOST=arkturian.com
DEPLOY_USER=root
DEPLOY_SSH_KEY=<your-private-ssh-key>
DEPLOY_PORT=22
VITE_ONEAL_API_BASE=https://oneal-api.arkturian.com/v1
VITE_ONEAL_API_KEY=oneal_demo_token
VITE_STORAGE_API_URL=https://api-storage.arkturian.com
VITE_STORAGE_API_KEY=<your-storage-key>
VITE_ARTRACK_API_BASE=https://api-artrack.arkturian.com
```

### DevOps Scripts

The project includes helper scripts in `.devops/scripts/`:

```bash
# Checkout a branch
./devops checkout dev

# Commit and push to dev
./devops push "feat: add new feature"

# Build locally
./devops build

# Release to production (merges dev → main, triggers deploy)
./devops release

# Update DevOps templates
./devops update
```

### Deployment Flow

1. **Development**: Work on `dev` branch
2. **Push**: `./devops push "your message"` - pushes to dev
3. **Release**: `./devops release` - merges to `main` and triggers deployment
4. **Deploy**: GitHub Actions builds and deploys to https://productfinder.arkturian.com

### Manual Deployment

SSH into the server and run:

```bash
ssh root@arkturian.com
cd /var/www/productfinder/repo
bash .devops/deploy.sh
```

### Rollback

If something goes wrong:

```bash
ssh root@arkturian.com
cd /var/www/productfinder/repo
bash .devops/rollback.sh
```

## Architecture

### Layout System

The application uses a hierarchical layout system inspired by pivot layouts:

- **LayoutNode** - Animated view state for each product
- **PivotLayouter** - Organizes products into columns/rows with configurable strategies
- **GridLayoutStrategy** - Inner layout strategy for arranging products within groups
- **WeightScalePolicy** - Scales products based on their weight property

### Data Flow

1. **ProductRepository** fetches data from O'Neal API
2. **LayoutEngine** creates LayoutNodes and computes positions
3. **CanvasRenderer** draws products with smooth animations
4. **InterpolatedProperty** handles all animations (position, size, opacity)

### Key Classes

- `Product` - Domain model for product data
- `LayoutNode<T>` - Generic animated layout node
- `PivotLayouter<T>` - Generic pivot-based layout engine
- `CanvasRenderer` - Canvas-based rendering engine
- `ImageCache` - Efficient image loading and caching

## API Integration

The app connects to the O'Neal Product API:

- **Base URL**: `https://oneal-api.arkturian.com/v1`
- **Endpoints**:
  - `GET /products` - List products with filters
  - `GET /products/{id}` - Get single product
  - `GET /facets` - Get available filter values
- **Authentication**: API key via `X-API-Key` header

## License

Proprietary - Arkturian
# ProductFinder Test
