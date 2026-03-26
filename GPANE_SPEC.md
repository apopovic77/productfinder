# GPANE — Generic Pivoting & Adaptive Navigation Engine

## Vollständige Spezifikation

---

## 1. Grundprinzip

Das System hat **Datenobjekte** (Produkte). Jedes Objekt hat **Eigenschaften** (Properties). Das System analysiert alle verfügbaren Eigenschaften und bestimmt automatisch:

1. **Welche Eigenschaften** als Pivot-Dimension taugen
2. **Welche Strategie** für jeden Datentyp angewendet wird
3. **Welche Dimension** als nächste empfohlen wird

### Eiserne Regel

> **Pivot = Umstrukturierung, nicht Reduktion.**
> Kein Objekt verschwindet. Objekte ohne Wert landen im "Unknown" Bucket.
> Die Gesamtzahl der sichtbaren Objekte bleibt immer konstant.

---

## 2. Datenmodell

```typescript
interface DataObject {
  id: string;
  properties: Record<string, PropertyValue>;
}

type PropertyValue =
  | string                    // "Helmets MX", "black"
  | number                    // 129.90, 1534
  | boolean                   // true, false
  | string[]                  // ["MX", "MTB"]
  | number[]                  // [2024, 2025]
  | null;                     // fehlend
```

---

## 3. Property-Analyse

Für jede Eigenschaft über alle Objekte wird berechnet:

```typescript
interface PropertyAnalysis {
  key: string;               // "price", "category", "color"
  label: string;             // "Preis", "Kategorie", "Farbe"

  // Datentyp
  dataType: DataType;        // siehe Abschnitt 4

  // Statistik
  coverage: number;          // 0.0 - 1.0 (% Objekte mit Wert)
  cardinality: number;       // Anzahl verschiedene Werte
  entropy: number;           // 0.0 - 1.0 (Verteilungsgleichmäßigkeit)

  // Abgeleitete Werte
  nullCount: number;         // Anzahl Objekte ohne diese Eigenschaft
  distribution: Distribution; // "uniform" | "skewed" | "bimodal" | "long-tail"

  // Pivotierbarkeit
  isPivotCandidate: boolean; // coverage >= threshold UND sinnvolle Varianz
  recommendedStrategy: PivotStrategy; // siehe Abschnitt 5
}
```

### Coverage-Schwellwerte

| Coverage | Bedeutung | Pivot-Eignung |
|----------|-----------|---------------|
| 1.0 | Alle Objekte haben den Wert | Ideal |
| 0.8 - 1.0 | Wenige fehlen → kleiner Unknown Bucket | Gut |
| 0.5 - 0.8 | Viele fehlen → großer Unknown Bucket | Möglich, mit Warnung |
| < 0.5 | Mehr als die Hälfte fehlt | Nicht empfohlen als Default |

---

## 4. Datentypen

### 4.1 Categorical (String — diskrete Werte)

**Beispiele:** Kategorie, Farbe, Sport, Produktlinie, Zielgruppe

**Erkennung:**
- Typ = string
- Cardinality < 30% der Objektanzahl (sonst ist es eher ein Identifier)

**Eigenschaften:**
```
"Helmets MX": 379 Objekte
"Boots MX": 75 Objekte
"Gloves": 299 Objekte
→ 24 verschiedene Werte
→ coverage: 100%
→ entropy: 0.87 (relativ gleichmäßig)
```

### 4.2 Numeric Continuous (Float/Int — Zahlenwerte)

**Beispiele:** Preis, Gewicht, Varianten-Anzahl

**Erkennung:**
- Typ = number
- Nicht als Enum erkennbar (mehr als ~15 verschiedene Werte)

**Eigenschaften:**
```
Preis: €0.19 - €599.90
→ coverage: 95%
→ 200+ verschiedene Werte
→ distribution: skewed (viele günstige, wenige teure)
```

### 4.3 Numeric Discrete (Int — zählbare Werte)

**Beispiele:** Jahrgang (2014-2028), Varianten-Anzahl

**Erkennung:**
- Typ = number
- Wenige verschiedene Werte (< 20)
- Ganzzahlig

**Eigenschaften:**
```
Jahrgang: 2014, 2015, ..., 2028
→ 15 verschiedene Werte
→ coverage: 99%
→ Jeder Wert = ein Bucket (kein Range nötig)
```

### 4.4 Boolean

**Beispiele:** is_spare, is_discontinued, is_nos

**Erkennung:**
- Typ = boolean ODER
- Nur 2 verschiedene Werte (true/false, ja/nein)

**Eigenschaften:**
```
is_spare: true (92), false (6130)
→ 2 Buckets
→ Nur sinnvoll als Filter, nicht als Pivot (zu wenig Differenzierung)
```

### 4.5 Multi-Value (Array)

**Beispiele:** sport: ["MX", "MTB"]

**Erkennung:**
- Wert ist Array
- Objekte können mehreren Buckets gleichzeitig zugeordnet sein

**Eigenschaften:**
```
sport: ["MX"] (2049), ["MTB"] (1456), ["MX", "MTB"] (einige)
→ Ein Objekt kann in MEHREREN Buckets erscheinen
→ Summe der Bucket-Größen > Gesamtzahl Objekte
```

### 4.6 Hierarchical (String mit impliziter Baumstruktur)

**Beispiele:** Taxonomie-Pfad ("Ausrüstung > Helme > MX > Fullface")

**Erkennung:**
- String mit Trennzeichen (" > ", "/", ".")
- Verschiedene Ebenen extrahierbar

**Eigenschaften:**
```
Level 0: "Ausrüstung" (alles)
Level 1: "Helme", "Bekleidung", "Schutz"
Level 2: "MX", "MTB", "Street"
→ Pro Level eine eigene Pivot-Möglichkeit
```

### 4.7 Text/Identifier (Nicht pivotierbar)

**Beispiele:** Produktname, SKU, EAN, Beschreibung

**Erkennung:**
- String
- Cardinality ≈ Objektanzahl (fast jeder Wert einzigartig)
- Oder: Sehr langer Text

**Eigenschaft:**
```
→ Nicht als Pivot-Dimension geeignet
→ Rolle: label, search, display
```

---

## 5. Pivot-Strategien

Für jeden Datentyp gibt es passende Strategien zur Bucket-Bildung:

### 5.1 Identity Buckets (Categorical)

**Anwendung:** Categorical mit geringer Cardinality (< 30 Werte)

**Logik:** Jeder einzigartige Wert = ein Bucket.

```
Dimension: category
Buckets: ["Helmets MX", "Boots MX", "Gloves", ...]
```

**Bucket-Regeln:**
- Sortierung: nach Häufigkeit (größte zuerst) oder alphabetisch
- Unknown Bucket: für Objekte ohne Wert
- Zusammenfassung: wenn > 15 Buckets → die kleinsten in "Sonstige" zusammenfassen

### 5.2 Range Buckets (Numeric Continuous)

**Anwendung:** Numerische Werte mit hoher Cardinality

**Logik:** Wertebereich in N gleichmäßige Bereiche teilen.

```
Dimension: price
Range: €0 - €600
Buckets: ["< €100", "€100-€200", "€200-€300", "€300-€400", "> €400"]
```

**Varianten:**
| Methode | Beschreibung | Wann |
|---------|-------------|------|
| Equal Width | Gleichmäßige Intervalle | Default |
| Equal Frequency | Gleich viele Objekte pro Bucket (Quantile) | Schiefe Verteilung |
| Smart Rounding | Runde Grenzen (€50, €100, €200) | Preise |
| Logarithmic | Log-Skala Intervalle | Große Spreizung |

**Bucket-Anzahl:**
- Default: 5-8 Buckets
- Mindestens 3 Objekte pro Bucket
- Nie mehr als 12 Buckets

### 5.3 Discrete Buckets (Numeric Discrete)

**Anwendung:** Ganzzahlige Werte mit geringer Cardinality (< 20)

**Logik:** Jeder Wert = ein Bucket (wie Identity, aber numerisch sortiert).

```
Dimension: model_year
Buckets: [2014, 2015, 2016, ..., 2028]
```

**Zusammenfassung:** Wenn > 12 Werte → ältere in "≤ 2018" zusammenfassen.

### 5.4 Boolean Split

**Anwendung:** Boolesche Werte

**Logik:** 2 Buckets (Ja/Nein).

```
Dimension: is_spare
Buckets: ["Ja", "Nein"]
```

**Bewertung:** Nur sinnvoll wenn Verteilung nicht zu extrem (min. 10% im kleineren Bucket). Sonst besser als Filter verwenden.

### 5.5 Multi-Value Expansion (Array)

**Anwendung:** Array-Werte

**Logik:** Jedes Array-Element erzeugt einen Bucket. Objekte mit mehreren Werten erscheinen in mehreren Buckets.

```
Dimension: sport
Objekt {sport: ["MX", "MTB"]} → erscheint in Bucket "MX" UND "MTB"
```

**Besonderheit:** Gesamtzahl in Buckets > Gesamtzahl Objekte. Die UI muss das klar machen.

### 5.6 Hierarchical Drill (Hierarchical)

**Anwendung:** Pfad-basierte Werte

**Logik:** Erst die oberste Ebene als Buckets zeigen. Bei Klick auf einen Bucket → nächste Ebene.

```
Level 0: ["Ausrüstung"] (1 Bucket, alle Objekte)
Level 1: ["Helme", "Bekleidung", "Schutz"] (3 Buckets)
Level 2: Innerhalb "Helme": ["MX", "MTB", "Street"]
```

---

## 6. Scoring — Welche Dimension wird vorgeschlagen?

### 6.1 Score-Berechnung

```typescript
function score(property: PropertyAnalysis, context: PivotContext): number {
  return (
    coverageScore(property)          // 0-1: Wie vollständig?
    + diversityScore(property)        // 0-1: Wie gut differenziert?
    + informationGain(property, ctx)  // 0-1: Wie viel Klarheit bringt es?
    + usabilityScore(property)        // 0-1: Wie gut bedienbar? (5-10 Buckets ideal)
    - redundancyPenalty(property, ctx) // 0-1: Ähnlich zu bereits verwendeter Dimension?
    - historyPenalty(property, ctx)    // 0-1: Wurde kürzlich schon verwendet?
    - fragmentationPenalty(property)   // 0-1: Zu viele oder zu wenige Buckets?
  );
}
```

### 6.2 Score-Faktoren im Detail

**Coverage Score (Gewicht: hoch)**
```
coverageScore = property.coverage
```
- 1.0 = ideal (alle Objekte haben den Wert)
- 0.5 = grenzwertig (50% Unknown)
- < 0.5 = nicht empfohlen

**Diversity Score (Gewicht: hoch)**
```
diversityScore = property.entropy × (1 - 1/cardinality)
```
- Hohe Entropy + viele Werte = gut differenziert
- Entropy 0 = alle gleich (nutzlos)
- Cardinality 1 = nur ein Wert (nutzlos)

**Information Gain (Gewicht: mittel)**
```
Wie stark reduziert diese Dimension die Unsicherheit?
IG = H(gesamt) - Σ (|bucket_i| / |gesamt|) × H(bucket_i)
```
- Berechnet auf Basis der ANDEREN verfügbaren Dimensionen
- Hoher IG = nach diesem Pivot sind die verbleibenden Dimensionen klarer

**Usability Score (Gewicht: mittel)**
```
Ideal: 5-8 Buckets
usabilityScore = 1 - |cardinality - 7| / 20
```
- 2 Buckets = langweilig
- 50 Buckets = unübersichtlich
- 5-10 = sweet spot

**Redundancy Penalty (Gewicht: hoch)**
```
Wenn property stark mit einer aktiven Dimension korreliert → Penalty
```
- Beispiel: "product_type" und "category" überlappen stark
- Jaccard-Ähnlichkeit der Bucket-Zuordnungen

**History Penalty (Gewicht: niedrig)**
```
Wurde diese Dimension in den letzten N Pivots schon verwendet?
historyPenalty = wasRecentlyUsed ? 0.3 : 0
```

**Fragmentation Penalty (Gewicht: mittel)**
```
Zu viele kleine Buckets mit je 1-2 Objekten
fragmentationPenalty = countSmallBuckets / totalBuckets
```

### 6.3 Dimension-Empfehlung

```typescript
function recommendNextDimension(
  properties: PropertyAnalysis[],
  context: PivotContext
): PropertyAnalysis {
  const candidates = properties.filter(p => p.isPivotCandidate);
  const scored = candidates.map(p => ({ property: p, score: score(p, context) }));
  scored.sort((a, b) => b.score - a.score);
  return scored[0].property;
}
```

---

## 7. Pivot-Kontext (State)

```typescript
interface PivotContext {
  // Alle Objekte im System (nie weniger)
  allObjects: DataObject[];

  // Explizite Filter (User hat bewusst reduziert)
  constraints: Constraint[];

  // Aktuelle Ansicht (Pivot verändert nur das)
  view: {
    activeDimension: string;           // welche Dimension wird gerade als Buckets gezeigt
    focusedBucket: string | null;      // welcher Bucket ist "aufgeklappt" (Zoom)
    strategy: PivotStrategy;           // welche Strategie wird angewendet
  };

  // History
  pivotHistory: string[];              // welche Dimensionen wurden schon gezeigt

  // Computed
  visibleObjects: DataObject[];        // nach Constraints, NICHT nach Pivot
  buckets: Map<string, DataObject[]>;  // aktuelle Bucket-Zuordnung
}

interface Constraint {
  dimension: string;
  operator: "eq" | "neq" | "gt" | "lt" | "range" | "in";
  value: any;
  source: "user" | "drill-down";      // woher kommt der Constraint?
}
```

### Wichtige Unterscheidung: Focus vs. Constraint

| Aktion | Effekt | Objekte |
|--------|--------|---------|
| Pivot wechseln | View ändert sich | Alle bleiben |
| Bucket fokussieren (Zoom) | View zoomt in Bucket | Alle bleiben, Fokus-Bucket groß |
| Constraint setzen | Datenmenge reduziert | Nur gefilterte sichtbar |

**Bucket-Fokus (Zoom):**
- Klick auf "Helmets MX" → Produkte in diesem Bucket werden groß dargestellt
- Die anderen Buckets werden klein/ausgegraut aber bleiben sichtbar
- Der User kann jederzeit zurück zur Übersicht
- Die nächste Pivot-Dimension wird NUR für die fokussierten Objekte berechnet

**Constraint (echter Filter):**
- Expliziter "Filter" Button auf einem Bucket
- Reduziert die Datenmenge
- Zeigt Constraint-Badge in der UI
- Kann entfernt werden

---

## 8. Visual Mapping

### 8.1 Bucket-Darstellung

| Bucket-Größe | Darstellung |
|-------------|-------------|
| Fokussiert | Volle Größe, alle Produkte sichtbar |
| Normal | Proportional zur Objektanzahl |
| Klein (< 3 Objekte) | Minimale Größe, Label sichtbar |
| Unknown | Am Rand, visuell unterscheidbar |

### 8.2 Fokus-Übergänge (Animation)

```
Übersicht → Fokus auf Bucket:
  - Fokus-Bucket wächst auf ~70% des Canvas
  - Andere Buckets schrumpfen an den Rand
  - Innerhalb des Fokus-Buckets: nächste Dimension wird angezeigt

Fokus → Übersicht:
  - Alle Buckets gleich groß
  - Smooth Animation
```

### 8.3 Dimension-Wechsel

```
Dimension A → Dimension B:
  - Objekte animieren von alten Buckets zu neuen Buckets
  - Kein Objekt verschwindet
  - Neue Buckets bauen sich auf
  - Alte Buckets lösen sich auf
```

---

## 9. Domain Priors (Optional)

Domänenspezifische Hinweise die das Scoring beeinflussen aber nicht überschreiben:

```typescript
interface DomainPrior {
  domain: string;                    // "oneal", "fashion", "electronics"
  preferredDimensions: string[];     // ["category", "product_line", "price"]
  dimensionAliases: Record<string, string>;  // {"color_name": "Farbe"}
  bucketSortPreferences: Record<string, "frequency" | "alpha" | "numeric">;
  maxBuckets: number;                // Default: 10
}
```

---

## 10. API-Anforderungen

Das Pivot-System braucht von der API:

```typescript
// Minimal: Liste von Objekten mit flachen Properties
GET /products?limit=5000

Response: {
  results: [
    {
      id: 14542,
      // Jede Property die pivotierbar sein soll:
      category: "Helmets MX",        // categorical
      product_line: "10SRS",          // categorical
      design_group: "10SRS Helmet PRODIGY",  // categorical
      color_name: "black",            // categorical
      sport: ["MX"],                  // multi-value
      price_from: 569.99,             // numeric continuous
      model_year: 2026,               // numeric discrete
      target_group: "Erwachsene",     // categorical (low cardinality)
      is_spare: false,                // boolean
      // ... weitere Properties
    }
  ]
}
```

**Anforderungen:**
1. Alle pivotierbaren Properties flach im Objekt (kein Nesting)
2. Konsistente Typen (nicht mal String, mal Number)
3. Null/undefined für fehlende Werte (nicht leerer String)
4. Arrays für Multi-Value Eigenschaften

---

## 11. Zusammenfassung: Datentyp → Strategie Matrix

| Datentyp | Strategie | Bucket-Bildung | Sortierung | Max Buckets |
|----------|-----------|----------------|------------|-------------|
| Categorical (< 15 Werte) | Identity | Jeder Wert = 1 Bucket | Häufigkeit | 15 |
| Categorical (15-50 Werte) | Identity + Sonstige | Top 12 + "Sonstige" | Häufigkeit | 13 |
| Categorical (> 50 Werte) | Nicht empfohlen | — | — | — |
| Numeric Continuous | Range | Gleich breite/häufige Intervalle | Numerisch | 5-8 |
| Numeric Discrete (< 15) | Discrete | Jeder Wert = 1 Bucket | Numerisch | 15 |
| Numeric Discrete (15+) | Range | Zusammengefasste Bereiche | Numerisch | 8 |
| Boolean | Split | 2 Buckets | — | 2 |
| Multi-Value | Expansion | Pro Wert 1 Bucket (Überlappung) | Häufigkeit | 10 |
| Hierarchical | Drill | Pro Ebene Identity | Level-abhängig | 10 |
| Text/Identifier | — | Nicht pivotierbar | — | — |

---

## 12. Offene Entscheidungen

### A) Auto-Pivot nach Bucket-Fokus?
Wenn der User auf einen Bucket klickt und das System die nächste Dimension auto-wählt — soll das sofort passieren oder soll der User erst bestätigen?

**Empfehlung:** Auto-Pivot mit hervorgehobenem Vorschlag. User kann jederzeit manuell wechseln.

### B) Fokus-Modus vs. Constraint-Modus
Wie unterscheidet die UI zwischen "ich will diesen Bucket genauer anschauen" und "ich will alles andere wegfiltern"?

**Empfehlung:**
- Single Click = Fokus (Zoom, reversibel)
- Expliziter Filter-Button oder Long-Press = Constraint

### C) Pivot-Wechsel Animation
Wie animiert das System wenn der User die Dimension wechselt?

**Empfehlung:** Objekte fliegen von alten Bucket-Positionen zu neuen. Dauer: 300-500ms.
