# Force Labels Integration - ProductFinder

## Installation ✅

Das Package ist bereits installiert:
```json
"@arkturian/react-force-labels": "file:../react-force-labels"
```

## Usage im ProductFinder

### 1. Product Annotations Component

Die `ProductAnnotations` Component zeigt automatisch verteilte Labels um ein Produkt:

```tsx
import { ProductAnnotations } from './components/ProductAnnotations';

<ProductAnnotations
  product={selectedProduct}
  anchorX={productWorldX}
  anchorY={productWorldY}
  canvasWidth={canvas.width}
  canvasHeight={canvas.height}
  viewportScale={viewport.scale}
  viewportOffsetX={viewport.offset.x}
  viewportOffsetY={viewport.offset.y}
/>
```

### 2. Integration in App.tsx

**Option A: Hero Mode Only (Empfohlen)**

Zeige Annotations nur im Hero Mode:

```tsx
// In App.tsx render()
{this.state.isPivotHeroMode && this.state.selectedProduct && (
  <ProductAnnotations
    product={this.state.selectedProduct}
    anchorX={productNode.posX.value + productNode.width.value / 2}
    anchorY={productNode.posY.value + productNode.height.value / 2}
    canvasWidth={canvas.width}
    canvasHeight={canvas.height}
    viewportScale={this.controller.getZoom()}
    viewportOffsetX={viewport.offset.x}
    viewportOffsetY={viewport.offset.y}
  />
)}
```

**Option B: Hovered Product**

Zeige Annotations beim Hover:

```tsx
{this.state.hoveredProduct && (
  <ProductAnnotations
    product={this.state.hoveredProduct}
    // ... props
  />
)}
```

### 3. Anpassung der Labels

Edit `src/components/ProductAnnotations.tsx`:

```tsx
// Füge neue Labels hinzu:
if (product.customAttribute) {
  labels.push({
    id: 'custom',
    anchor: new Vector2(screenX + 50, screenY + 50),
    content: product.customAttribute,
    priority: 1,  // 1 = niedrig, 5 = hoch
  });
}
```

### 4. Styling anpassen

Ändere die Farben/Styles in `ProductAnnotations.tsx`:

```tsx
style={{
  backgroundColor: 'rgba(0, 0, 0, 0.9)',  // Dunkel
  textColor: '#ffffff',                    // Weiß
  borderColor: '#10b981',                  // Grün
  borderWidth: 2,
  borderRadius: 12,                        // Mehr rounded
  fontSize: 16,                            // Größer
  fontWeight: 700,                         // Bold
  shadow: true,
}}
```

### 5. Force-Parameter tunen

Optimiere das Verhalten:

```tsx
forceConfig={{
  anchorStrength: 0.2,      // Stärker anziehen (0.1-0.5)
  repulsionStrength: 150,   // Stärker abstoßen (50-200)
  minDistance: 60,          // Min Abstand vom Anker (px)
  maxDistance: 200,         // Max Abstand vom Anker (px)
  enableCollision: true,    // Kollisionserkennung
  friction: 0.85,           // Dämpfung (0.8-0.95)
}}
```

## Beispiel-Flow

1. User klickt auf Produkt im Hero Mode
2. `handleCanvasClick()` setzt `selectedProduct`
3. `ProductAnnotations` wird gemounted
4. Labels berechnen automatisch ihre Position
5. Animation läuft für ~1-2 Sekunden
6. Labels sind optimal verteilt, keine Überlappungen ✨

## Features

✅ **Automatische Verteilung** - Labels finden selbst die beste Position
✅ **Keine Überlappungen** - Kollisionserkennung verhindert Overlays
✅ **Prioritäten** - Wichtige Labels (Preis) bleiben näher am Produkt
✅ **Smooth Animation** - 60 FPS Physics-Simulation
✅ **Click-through** - Annotations blockieren Canvas-Interaktion nicht
✅ **Responsive** - Funktioniert mit allen Zoom-Levels

## Verfügbare Product-Daten

Folgende Product-Properties können als Labels genutzt werden:

```tsx
product.name           // Produktname
product.price.value    // Preis
product.brand          // Marke (z.B. "O'NEAL")
product.category[]     // Kategorien
product.season         // Saison (z.B. 2025)
product.weight         // Gewicht in g
product.attributes     // Weitere Attribute (Color, Size, etc.)
product.meta           // Zusätzliche Metadaten
```

## Performance

- **12 KB gzipped** - Sehr leichtgewichtig
- **60 FPS** - RequestAnimationFrame Loop
- **Auto-convergence** - Stoppt automatisch bei Stabilisierung
- **Optimiert** - Nur wenn Component visible

## Troubleshooting

**Labels überlappen sich:**
→ Erhöhe `repulsionStrength` oder reduziere Anzahl der Labels

**Labels zu weit weg:**
→ Reduziere `maxDistance` oder erhöhe `anchorStrength`

**Animation zu schnell/langsam:**
→ Ändere `friction` (0.8 = schnell, 0.95 = langsam)

**Labels zittern:**
→ Erhöhe `friction` oder reduziere `iterations`

## Weitere Infos

Vollständige API-Dokumentation:
```
/Volumes/DatenAP/Code/react-force-labels/README.md
```

Demo App lokal testen:
```bash
cd /Volumes/DatenAP/Code/react-force-labels
npm run dev
```
