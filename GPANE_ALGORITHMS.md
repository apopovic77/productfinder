# GPANE — Algorithmen-Dokumentation

## Teil 1: Bucket-Bildung
## Teil 2: Dimensions-Priorisierung
## Teil 3: Hierarchien

---

# Teil 1: Bucket-Bildung

Für jede Eigenschaft muss entschieden werden: Wie werden Objekte in Gruppen (Buckets) aufgeteilt?

Die Bucket-Bildung hat zwei Inputs:
- **Datentyp** der Eigenschaft
- **Verteilung** der Werte im aktuellen Kontext

## 1.1 Categorical Buckets

**Wann:** String-Werte mit endlicher Menge (< 50 verschiedene Werte)

**Beispiele:** category="Helmets MX", color="black", target_group="Erwachsene"

**Algorithmus:**

```
1. Zähle Häufigkeit jedes Wertes
2. Sortiere nach Häufigkeit (absteigend)
3. Wenn Anzahl verschiedene Werte ≤ MAX_BUCKETS (default: 12):
     → Jeder Wert = 1 Bucket
4. Wenn Anzahl > MAX_BUCKETS:
     → Top (MAX_BUCKETS - 1) als eigene Buckets
     → Rest zusammenfassen in "Sonstige" Bucket
5. Objekte ohne Wert → "N/A" Bucket
```

**Parameter:**
- MAX_BUCKETS: 12 (konfigurierbar)
- MIN_BUCKET_SIZE: 1 (jeder Wert wird gezeigt, auch mit 1 Objekt)
- Sortierung: "frequency" (default), "alphabetic", "custom"

**Beispiel:**
```
Eigenschaft: category (24 verschiedene Werte, 2594 Objekte)

Bucket 1: "Helmets MX" (379)
Bucket 2: "Gloves" (299)
Bucket 3: "Jerseys Offroad" (298)
Bucket 4: "Pants MX" (265)
...
Bucket 11: "Casual Wear" (27)
Bucket 12: "Sonstige" (Shoes + Jackets + Rain Wear + ... = 89)
Bucket 13: "N/A" (0)

Summe: 2594 ✓ (nichts verloren)
```

---

## 1.2 Numeric Range Buckets

**Wann:** Zahlenwerte mit hoher Cardinality (> 15 verschiedene Werte)

**Beispiele:** price=129.90, weight_grams=1534

### Algorithmus A: Equal Width (Default)

```
1. Bestimme min und max der Werte
2. Berechne Intervallbreite: width = (max - min) / BUCKET_COUNT
3. Runde Grenzen auf "schöne" Zahlen (Smart Rounding)
4. Erzeuge BUCKET_COUNT Intervalle
5. Letzter Bucket: "> letzte Grenze" (offen nach oben)
6. Objekte ohne Wert → "N/A" Bucket
```

**Smart Rounding Regeln:**
```
Wert < 10:        runde auf 0.5   (3.7 → 4.0)
Wert 10-100:      runde auf 5     (47 → 45)
Wert 100-1000:    runde auf 50    (347 → 350)
Wert 1000-10000:  runde auf 500   (3470 → 3500)
Wert > 10000:     runde auf 5000  (34700 → 35000)
```

**Beispiel:**
```
Eigenschaft: price (€0.19 - €599.90, 2594 Objekte)
BUCKET_COUNT: 5

Bucket 1: "< €100" (412)
Bucket 2: "€100-€200" (1256)
Bucket 3: "€200-€300" (534)
Bucket 4: "€300-€400" (89)
Bucket 5: "> €400" (23)
Bucket 6: "N/A" (280)

Summe: 2594 ✓
```

### Algorithmus B: Equal Frequency (Quantile)

```
1. Sortiere alle Werte
2. Teile in BUCKET_COUNT gleich große Gruppen
3. Bucket-Grenzen = Werte an den Quantil-Grenzen
4. Runde Grenzen (Smart Rounding)
```

**Wann statt Equal Width:**
- Verteilung ist stark schief (z.B. 80% der Preise unter €100)
- Equal Width würde leere Buckets erzeugen

**Beispiel:**
```
Eigenschaft: price, Verteilung schief (viele günstige)
BUCKET_COUNT: 5, je ~500 Objekte

Bucket 1: "< €25" (518)      ← Griffe, Socken
Bucket 2: "€25-€90" (502)    ← Jerseys, Handschuhe
Bucket 3: "€90-€150" (524)   ← Helme, Hosen
Bucket 4: "€150-€200" (498)  ← Premium Helme
Bucket 5: "> €200" (472)     ← Stiefel, Carbon

Jeder Bucket hat ähnlich viele Objekte ✓
```

### Algorithmus C: Logarithmic

```
1. Transformiere Werte: log(value)
2. Wende Equal Width auf die log-Werte an
3. Transformiere Grenzen zurück: exp(grenze)
```

**Wann:** Wertebereich über mehrere Größenordnungen (z.B. €0.19 bis €599)

### Subsplit-Algorithmus (bei erneutem Klick auf gleiche Dimension)

```
1. User hat Bucket "€100-€200" fokussiert
2. Neuer Wertebereich: min=€100, max=€200
3. Prüfe: (max/min) ≥ 2 UND Objektanzahl ≥ 10?
   JA → Neue Buckets innerhalb des Bereichs bilden
   NEIN → Subsplit nicht sinnvoll, andere Dimension empfehlen
4. Neuer BUCKET_COUNT: min(5, alter_count)
5. Neue Grenzen: Smart Rounding innerhalb [100, 200]

Ergebnis:
Bucket 1: "€100-€120" (145)
Bucket 2: "€120-€150" (312)
Bucket 3: "€150-€180" (198)
Bucket 4: "€180-€200" (87)
```

**Parameter:**
- BUCKET_COUNT: 5 (default), range: 3-8
- MIN_OBJECTS_FOR_SUBSPLIT: 10
- MIN_RANGE_RATIO: 2 (max/min muss mindestens Faktor 2 sein)

---

## 1.3 Discrete Buckets

**Wann:** Ganzzahlige Werte mit geringer Cardinality (< 15 verschiedene Werte)

**Beispiele:** model_year=2026, variant_count=6

**Algorithmus:**

```
1. Zähle Häufigkeit jedes Wertes
2. Wenn Anzahl verschiedene Werte ≤ MAX_BUCKETS:
     → Jeder Wert = 1 Bucket
     → Sortierung: numerisch (aufsteigend)
3. Wenn Anzahl > MAX_BUCKETS:
     → Älteste/kleinste Werte zusammenfassen
     → z.B. "≤ 2018" statt 2014, 2015, 2016, 2017, 2018
4. Objekte ohne Wert → "N/A" Bucket
```

**Beispiel:**
```
Eigenschaft: model_year (15 Werte: 2014-2028)
MAX_BUCKETS: 12

Bucket 1: "≤ 2017" (2014+2015+2016+2017 zusammen)
Bucket 2: "2018"
Bucket 3: "2019"
...
Bucket 11: "2027"
Bucket 12: "2028"
Bucket 13: "N/A"
```

---

## 1.4 Boolean Buckets

**Wann:** Nur 2 mögliche Werte

**Beispiele:** is_spare, is_discontinued

**Algorithmus:**

```
1. Zwei Buckets: "Ja" und "Nein"
2. Objekte ohne Wert → "N/A"
3. Bewertung: Nur sinnvoll als Pivot wenn:
   - Kleinerer Bucket ≥ 10% der Objekte
   - Sonst besser als Filter verwenden
```

**Beispiel:**
```
Eigenschaft: is_spare
Bucket "Ja": 92 (3.5%)
Bucket "Nein": 2502 (96.5%)
→ Nicht empfohlen als Pivot (zu ungleich)
→ Empfohlen als Filter
```

---

## 1.5 Multi-Value Buckets

**Wann:** Array-Werte — ein Objekt gehört zu mehreren Buckets

**Beispiele:** sport: ["MX", "MTB"]

**Algorithmus:**

```
1. Sammle alle einzigartigen Werte über alle Arrays
2. Für jeden Wert: Bucket enthält alle Objekte die diesen Wert im Array haben
3. Ein Objekt kann in MEHREREN Buckets erscheinen
4. Leere Arrays → "N/A" Bucket
```

**Beispiel:**
```
Eigenschaft: sport

Objekt A: sport=["MX"]     → nur in Bucket "MX"
Objekt B: sport=["MTB"]    → nur in Bucket "MTB"
Objekt C: sport=["MX","MTB"] → in Bucket "MX" UND "MTB"

Bucket "MX": 2049 Objekte (inkl. Objekt A und C)
Bucket "MTB": 1456 Objekte (inkl. Objekt B und C)

Summe Buckets: 3505 > 2594 Gesamtobjekte
→ Das ist korrekt bei Multi-Value!
→ UI muss das kommunizieren
```

---

## 1.6 Text-Transformations-Buckets

**Wann:** Freie Text-Werte die zu viele einzigartige Werte haben für Identity Buckets

**Beispiele:** Produktname, SKU, Beschreibung

**Vor der Bucket-Bildung muss eine Transformation stattfinden:**

### Transformation A: Token (erstes Wort)
```
Input: "3SRS Helmet RIFF 2.0 red/teal"
Transform: SPLIT(" ")[0] → "3SRS"
Dann: Categorical Buckets auf "3SRS", "5SRS", "ELEMENT"...
```

### Transformation B: Prefix
```
Input: SKU "0499S-401"
Transform: erste 4 Zeichen → "0499"
Dann: Categorical Buckets auf "0499", "0650", "0628"...
```

### Transformation C: Pattern Extract (Regex)
```
Input: SKU "0499S-401"
Transform: regex /(\d{4})/ → "0499"
Dann: Categorical Buckets
```

### Transformation D: Alphabetic Range
```
Input: Produktname
Transform: erster Buchstabe → "A", "B", "C"...
Dann: Categorical Buckets auf "A-D", "E-H", "I-L", "M-P", "Q-T", "U-Z"
```

### Transformation E: Keyword Extraction
```
Input: Beschreibung "Außenschale 100% Kohlefaser, Innenfutter Polyester"
Transform: bekannte Keywords finden → "Carbon", "Polyester"
Dann: Multi-Value Buckets (ein Objekt kann mehrere Keywords haben)
```

### Transformation F: Semantic Cluster (AI-basiert)
```
Input: Alle Beschreibungen
Transform: Embeddings berechnen → K-Means Clustering
Dann: Cluster-Buckets ("Schutzausrüstung", "Bekleidung leicht", "Bekleidung schwer"...)
```

**Wichtig:** Die Transformation wird als separater Schritt VOR der Bucket-Bildung ausgeführt. Die transformierten Werte werden dann wie Categorical/Multi-Value behandelt.

---

## 1.7 Zusammenfassung Bucket-Algorithmen

```
Eigenschaft erkannt
    │
    ├── Typ: Boolean
    │   └── 2 Buckets (Ja/Nein) + N/A
    │
    ├── Typ: Multi-Value (Array)
    │   └── Multi-Value Expansion + N/A
    │
    ├── Typ: Number
    │   ├── Cardinality < 15 → Discrete Buckets + N/A
    │   └── Cardinality ≥ 15 → Range Buckets (Equal Width/Frequency) + N/A
    │       └── Bei Subsplit: engere Ranges im fokussierten Bereich
    │
    ├── Typ: String
    │   ├── Cardinality < 50 → Categorical (Identity) + Sonstige + N/A
    │   ├── Cardinality ≥ 50 → Text-Transformation nötig
    │   │   └── Token / Prefix / Regex / Alphabetic / Keyword / Semantic
    │   └── Cardinality ≈ Objektanzahl → nicht pivotierbar (Label/Identifier)
    │
    └── Typ: Hierarchical (enthält Trennzeichen)
        └── Ebenen-basiert: aktuelle Ebene als Categorical
```

---

# Teil 2: Dimensions-Priorisierung

Die zentrale Frage: **Welche Dimension zeigt das System als nächstes?**

## 2.1 Wann wird die Priorität berechnet?

```
Zeitpunkt 1: Beim Laden (initiale Dimension)
  → Über ALLE Objekte
  → Wählt die Dimension mit dem höchsten Score

Zeitpunkt 2: Nach jedem Bucket-Fokus (nächste Dimension)
  → Über die FOKUSSIERTEN Objekte (nicht alle!)
  → Wählt die beste Dimension für diesen Kontext
  → Die aktuelle Dimension fließt als History ein
```

## 2.2 Score-Formel

```
Score(dimension, context) =

    Coverage(dimension, context)         × 0.25    [0-1]
  + Diversity(dimension, context)        × 0.25    [0-1]
  + InformationGain(dimension, context)  × 0.20    [0-1]
  + Usability(dimension)                 × 0.15    [0-1]
  - Redundancy(dimension, context)       × 0.10    [0-1]
  - History(dimension, context)          × 0.05    [0-1]
```

## 2.3 Jeder Faktor erklärt

### Coverage (Gewicht: 25%)

> Wie viel Prozent der aktuell sichtbaren Objekte haben diese Eigenschaft?

```
Coverage = Anzahl Objekte mit Wert / Gesamtanzahl Objekte

Beispiel (nach Fokus auf "Helmets MX", 379 Objekte):
  product_line: 379/379 = 1.0     ← alle Helme haben eine Linie
  model_year:   375/379 = 0.99
  color_name:   379/379 = 1.0
  weight:       340/379 = 0.90
  material:     280/379 = 0.74
```

**Bewertung:**
- 1.0 = perfekt
- 0.8-1.0 = gut (kleiner N/A Bucket)
- 0.5-0.8 = akzeptabel (großer N/A Bucket, Warnung)
- < 0.5 = nicht empfohlen (mehr als die Hälfte unbekannt)

---

### Diversity (Gewicht: 25%)

> Wie stark differenziert die Eigenschaft die Objekte?

```
Diversity = NormalizedEntropy × (1 - 1/Cardinality)

NormalizedEntropy = -Σ (p_i × log2(p_i)) / log2(n)
  wobei p_i = Anteil der Objekte in Bucket i
  und n = Anzahl Buckets

Beispiel (Helmets MX, 379 Objekte):
  product_line:  11 Werte, relativ gleichmäßig → Diversity 0.82
  target_group:  2 Werte (Erwachsene 350, Jugendliche 29) → Diversity 0.31
  color_name:    8 Grundfarben, gleichmäßig → Diversity 0.89
  sport:         1 Wert (alle MX) → Diversity 0.0 ← nutzlos nach Helm-Fokus!
```

**Bewertung:**
- 0.8-1.0 = gute Differenzierung
- 0.5-0.8 = akzeptabel
- < 0.3 = zu wenig Unterscheidung (z.B. nur 2 Buckets, einer riesig)
- 0.0 = alle Objekte haben gleichen Wert → NICHT als Dimension anbieten

---

### Information Gain (Gewicht: 20%)

> Wie viel Ordnung bringt diese Dimension in die Daten?

```
IG(dimension) = H(other_dimensions) - H(other_dimensions | dimension)

Vereinfacht:
  Wenn ich nach dieser Dimension gruppiere — werden die Objekte
  innerhalb jedes Buckets dann homogener bezüglich der ANDEREN
  Dimensionen?

Beispiel:
  Gruppiere Helmets MX nach product_line:
    Bucket "3SRS": Preise €100-€180, ähnliches Gewicht → homogen ✓
    Bucket "10SRS": Preise €200-€570, Carbon → homogen ✓
  → Hoher Information Gain (nach Linie sind Preis und Material vorhersagbar)

  Gruppiere Helmets MX nach color_name:
    Bucket "Schwarz": alle Linien gemischt, alle Preise → heterogen ✗
    Bucket "Rot": alle Linien gemischt → heterogen ✗
  → Niedriger Information Gain (Farbe sagt nichts über Preis/Linie aus)
```

**Berechnung (vereinfacht für Performance):**
```
1. Für jede Kandidaten-Dimension D:
2.   Bilde Buckets nach D
3.   Für jeden Bucket B:
4.     Berechne Entropy der 2-3 wichtigsten ANDEREN Dimensionen
5.     Gewichte mit Bucket-Größe
6.   IG(D) = 1 - gewichtete_durchschnitts_entropy
```

---

### Usability (Gewicht: 15%)

> Ist die Bucket-Anzahl für die UI sinnvoll?

```
                    ┌─ ideal ─┐
Score:  0.0 ────────┤ 1.0     ├──────── 0.0
Buckets: 1    2   3   5  7  10  12  15  20  30+

Formel:
  if buckets >= 3 && buckets <= 10: score = 1.0
  if buckets == 2: score = 0.5
  if buckets == 1: score = 0.0
  if buckets > 10: score = max(0, 1.0 - (buckets - 10) × 0.1)
```

**Sweet Spot: 5-8 Buckets**
- 2 Buckets = langweilig (Boolean → besser als Filter)
- 3-10 Buckets = ideal
- 12+ Buckets = unübersichtlich
- 20+ Buckets = nicht pivotierbar ohne Zusammenfassung

---

### Redundancy (Gewicht: 10%, Abzug)

> Wie ähnlich ist diese Dimension zu einer bereits aktiven/fokussierten?

```
Redundancy = max(JaccardSimilarity(D, active_dimension) for each active)

JaccardSimilarity: Wie stark überlappen die Bucket-Zuordnungen?

Beispiel:
  category = "Helmets MX" (aktiv/fokussiert)
  product_type = "Helm"
  → Fast identische Zuordnung → Redundancy 0.95 → HOHER Abzug

  category = "Helmets MX" (aktiv)
  price → komplett andere Zuordnung → Redundancy 0.0 → kein Abzug
```

**Warum wichtig:** Verhindert dass das System "Kategorie" → "Produkttyp" vorschlägt (was quasi die gleiche Information ist).

---

### History (Gewicht: 5%, Abzug)

> Wurde diese Dimension kürzlich schon als Pivot verwendet?

```
History = if dimension in last 3 pivots: 0.3
          else if dimension in last 5 pivots: 0.15
          else: 0.0
```

**Warum:** Verhindert Ping-Pong zwischen Dimensionen. Wenn der User gerade von "Preis" weggepivotiert hat, soll "Preis" nicht sofort wieder vorgeschlagen werden.

---

## 2.4 Gesamt-Beispiel

```
Kontext: User hat auf "Helmets MX" fokussiert (379 Objekte)
Letzte Dimension: category (in History)

Dimension       Coverage  Diversity  IG    Usability  Redundancy  History  SCORE
─────────────────────────────────────────────────────────────────────────────────
product_line    1.0×0.25  0.82×0.25  0.7×0.2  1.0×0.15  0.0×0.1  0.0×0.05  = 0.76 ★
model_year      0.99×0.25 0.75×0.25  0.3×0.2  0.8×0.15  0.0×0.1  0.0×0.05  = 0.63
color_name      1.0×0.25  0.89×0.25  0.1×0.2  1.0×0.15  0.0×0.1  0.0×0.05  = 0.64
price           0.95×0.25 0.78×0.25  0.5×0.2  1.0×0.15  0.0×0.1  0.0×0.05  = 0.68
target_group    1.0×0.25  0.31×0.25  0.2×0.2  0.5×0.15  0.0×0.1  0.0×0.05  = 0.44
sport           1.0×0.25  0.0×0.25   0.0×0.2  0.0×0.15  0.8×0.1  0.0×0.05  = 0.17 ✗
category        1.0×0.25  0.0×0.25   0.0×0.2  0.0×0.15  0.95×0.1 0.3×0.05  = 0.12 ✗

Empfehlung: product_line (Score 0.76)
```

---

## 2.5 Dimension-Wahl Entscheidungsbaum

```
Nach Bucket-Fokus:
    │
    ├── Ist aktuelle Dimension hierarchisch?
    │   └── JA: Gibt es tiefere Ebene?
    │       ├── JA → bleib in gleicher Dimension, nächste Ebene
    │       └── NEIN → Score-basierte Wahl (s.u.)
    │
    ├── Ist aktuelle Dimension numerisch UND Subsplit sinnvoll?
    │   └── Prüfe: Range-Ratio ≥ 2 UND Objekte ≥ 10
    │       ├── JA → berechne Subsplit-Score vs. beste andere Dimension
    │       │   ├── Subsplit-Score höher → gleiche Dimension, feinere Buckets
    │       │   └── Andere höher → Score-basierte Wahl
    │       └── NEIN → Score-basierte Wahl
    │
    └── Score-basierte Wahl:
        1. Berechne Score für alle Dimensionen (über fokussierte Objekte)
        2. Entferne Dimensionen mit Diversity = 0
        3. Sortiere nach Score
        4. Empfehle Top-1
        5. Zeige Top-3 als Alternativen in der UI
```

---

# Teil 3: Hierarchien

## 3.1 Was ist eine Hierarchie?

Eine Hierarchie ist eine Eigenschaft die **mehrere Abstraktionsebenen** hat. Bei einem Pivot auf diese Eigenschaft drilled das System von grob nach fein, INNERHALB der gleichen Eigenschaft.

## 3.2 Typen von Hierarchien

### Typ A: Explizite Hierarchie (Pfad-basiert)

Die Eigenschaft enthält einen Pfad mit Trennzeichen.

```
Eigenschaft: taxonomy
Wert: "Ausrüstung > Helme > MX > Fullface"

Ebene 0: "Ausrüstung" (1 Bucket — alle Objekte)
Ebene 1: "Helme" / "Bekleidung" / "Schutz" (3 Buckets)
Ebene 2: "MX" / "MTB" / "Street" (3 Buckets innerhalb "Helme")
Ebene 3: "Fullface" / "Open Face" (2 Buckets innerhalb "MX")
```

**Erkennung:** String enthält Trennzeichen (">", "/", ".")
**Bucket-Bildung:** Categorical auf der aktuellen Ebene
**Navigation:** Klick auf Bucket → nächste Ebene zeigen

### Typ B: Implizite Hierarchie (Datenbeziehung)

Mehrere separate Eigenschaften bilden zusammen eine Hierarchie.

```
Eigenschaft 1: category = "Helmets MX"     (grob)
Eigenschaft 2: product_line = "3SRS"        (feiner)
Eigenschaft 3: design_group = "3SRS RIFF"   (noch feiner)
Eigenschaft 4: color_name = "black"         (feinste)
```

**Erkennung:** NICHT automatisch erkennbar. Muss konfiguriert werden.
**Beziehung:** Wenn man nach category filtert, hat product_line höheren Information Gain als color_name.

### Typ C: Numerische Hierarchie (Zoom)

Eine numerische Eigenschaft die man immer feiner auflösen kann.

```
Eigenschaft: price
Ebene 0: "< €100" / "€100-€300" / "> €300" (3 Buckets)
Ebene 1: (nach Klick auf €100-€300) → "€100-€150" / "€150-€200" / "€200-€300"
Ebene 2: (nach Klick auf €150-€200) → "€150-€160" / "€160-€170" / "€170-€180" / "€180-€200"
```

**Erkennung:** Automatisch (numerisch + großer Wertebereich)
**Bucket-Bildung:** Subsplit-Algorithmus (siehe Teil 1.2)
**Navigation:** Klick auf Bucket → engerer Bereich, neue Grenzen

## 3.3 Wie fügt sich Hierarchie ins Pivot-System ein?

Hierarchie beeinflusst die **Dimensions-Wahl nach einem Fokus**:

```
OHNE Hierarchie-Wissen:
  category → [Score entscheidet] → vielleicht price, vielleicht color

MIT Hierarchie-Wissen:
  category → [Hierarchie-Regel] → product_line (weil gleiche Hierarchie)
  product_line → [Hierarchie-Regel] → design_group
  design_group → [Score entscheidet] → color ODER price (Hierarchie endet hier)
```

### Regel für den Score:

```
Wenn Dimension D Teil einer Hierarchie ist:
  UND die aktuelle Dimension ist der Parent von D in der Hierarchie:
  → Bonus auf den Score von D: +0.3

Das überschreibt den Score NICHT, es beeinflusst ihn.
Wenn eine andere Dimension trotzdem viel besser scored, gewinnt sie.
```

### Beispiel:

```
Fokus auf "Helmets MX" (category):

product_line:  Score 0.76 + Hierarchie-Bonus 0.3 = 1.06 ★
price:         Score 0.68 + kein Bonus = 0.68
color_name:    Score 0.64 + kein Bonus = 0.64

→ product_line gewinnt klar durch Hierarchie-Bonus
```

```
Fokus auf "3SRS" (product_line):

design_group:  Score 0.71 + Hierarchie-Bonus 0.3 = 1.01 ★
price:         Score 0.72 + kein Bonus = 0.72
color_name:    Score 0.68 + kein Bonus = 0.68

→ design_group gewinnt durch Bonus, obwohl price fast gleich scored
```

```
Fokus auf "3SRS Helmet RIFF" (design_group, Hierarchie endet):

color_name:    Score 0.85 + kein Bonus = 0.85 ★
price:         Score 0.45 + kein Bonus = 0.45

→ color_name gewinnt durch normales Scoring (wenige Objekte, Farbe differenziert am besten)
```

## 3.4 Hierarchie-Konfiguration

Hierarchien werden als **Domain Prior** konfiguriert, nicht hart kodiert:

```typescript
interface HierarchyDefinition {
  name: string;                    // "product_hierarchy"
  levels: string[];                // ["category", "product_line", "design_group", "color_name"]
  bonusPerLevel: number;           // 0.3 (Score-Bonus für nächste Ebene)
  strictOrder: boolean;            // false = Bonus, true = erzwungen
}
```

**strictOrder = false (Default):**
- Hierarchie gibt einen Score-Bonus
- System KANN trotzdem eine andere Dimension wählen wenn sie viel besser ist
- Flexibel, datengetrieben

**strictOrder = true:**
- Hierarchie erzwingt die Reihenfolge
- Nächste Dimension ist IMMER die nächste Ebene
- Kein Scoring, deterministische Navigation
- Entspricht dem "Tree Pivot" Modus

## 3.5 Hierarchie vs. Score: Zusammenspiel

```
                    ┌──────────────────────────────┐
                    │  User klickt auf Bucket       │
                    └──────────┬───────────────────┘
                               │
                    ┌──────────▼───────────────────┐
                    │  Gibt es eine Hierarchie-     │
                    │  Definition die greift?       │
                    └──────────┬───────────────────┘
                               │
                    ┌──────────▼───────────────────┐
               ┌────┤  strictOrder?                 ├────┐
               │    └──────────────────────────────┘    │
              JA                                       NEIN
               │                                        │
    ┌──────────▼──────────┐              ┌──────────────▼──────────┐
    │  Nächste Ebene der   │              │  Score + Bonus berechnen │
    │  Hierarchie (fest)   │              │  (Hierarchie-Ebene +0.3) │
    └──────────────────────┘              └──────────────┬──────────┘
                                                         │
                                          ┌──────────────▼──────────┐
                                          │  Höchster Score gewinnt  │
                                          │  (kann auch nicht-       │
                                          │   Hierarchie sein)       │
                                          └──────────────────────────┘
```

---

## Gesamtbild

```
┌─────────────────────────────────────────────────────────────┐
│                    GPANE Engine                               │
│                                                              │
│  ┌──────────────────┐    ┌──────────────────┐               │
│  │ Property Analyzer │───▶│ Bucket Builder   │               │
│  │                  │    │                  │               │
│  │ - Datentyp       │    │ - Categorical    │               │
│  │ - Coverage       │    │ - Range          │               │
│  │ - Cardinality    │    │ - Discrete       │               │
│  │ - Entropy        │    │ - Boolean        │               │
│  │ - Distribution   │    │ - Multi-Value    │               │
│  └──────────────────┘    │ - Text-Transform │               │
│                          │ - Hierarchical   │               │
│                          └────────┬─────────┘               │
│                                   │                          │
│  ┌──────────────────┐    ┌────────▼─────────┐               │
│  │ Scoring Engine    │───▶│ Dimension Picker │               │
│  │                  │    │                  │               │
│  │ - Coverage       │    │ - Beste Dimension│               │
│  │ - Diversity      │    │ - Alternativen   │               │
│  │ - Info Gain      │    │ - Hierarchie     │               │
│  │ - Usability      │    │   Bonus/Erzwung. │               │
│  │ - Redundancy     │    └────────┬─────────┘               │
│  │ - History        │             │                          │
│  └──────────────────┘    ┌────────▼─────────┐               │
│                          │ Layout Engine     │               │
│  ┌──────────────────┐    │                  │               │
│  │ Context / State   │    │ - Bucket-Positionen│              │
│  │                  │    │ - Animationen    │               │
│  │ - allObjects     │    │ - Focus/Zoom     │               │
│  │ - constraints    │    └──────────────────┘               │
│  │ - view           │                                        │
│  │ - pivotHistory   │                                        │
│  └──────────────────┘                                        │
└─────────────────────────────────────────────────────────────┘
```
