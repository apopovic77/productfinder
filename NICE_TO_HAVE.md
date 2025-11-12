# Nice to Have Features

## Image Cache - All Product Images

**Problem:**
- Warmup script lädt nur das **Hauptbild** jedes Produkts in den Cache
- Varianten-Bilder (verschiedene Farben), Rückansichten und zusätzliche `product.media[]` Bilder werden NICHT vorgeladen
- Diese Bilder laden erst beim ersten Öffnen des Modals → 2+ Sekunden Ladezeit pro Thumbnail

**Lösung:**
- `warmup_image_cache.py` erweitern um ALLE Bilder zu laden:
  - Alle Einträge in `product.media[]` (nicht nur erstes)
  - Alle Varianten-Bilder (`variant.image_storage_id`)
  - Beide Größen: 130px (Thumbnails) und 1300px (Modal Hero)

**Benefit:**
- Alle Thumbnails laden instant aus IndexedDB Cache (0-5ms statt 2000ms)
- Bessere User Experience beim Durchklicken von Produkten

**Trade-off:**
- Initial warmup dauert länger (mehr Bilder müssen geladen werden)
- Größerer Storage API Cache auf dem Server
- Aber: Bessere UX nach dem ersten Warmup

**Aktueller Code-Kommentar in `warmup_image_cache.py:71-72`:**
```python
# Only warm primary image per product
break
```

**Änderung:**
Entferne das `break` Statement und lade alle `media` Einträge + Varianten-Bilder.

---

## Weitere Features

_(Platzhalter für zukünftige Features)_
