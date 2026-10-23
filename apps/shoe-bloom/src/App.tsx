import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { EngineScene, type EngineView } from './engine/EngineScene';
import { loadDesigns, type Design, type Shoe } from './data';

const WALL_COUNT = 196;

/**
 * Alles über die Wave-Engine (ein instanziertes Morph-Partikel je Kachel):
 * Blüte: Ebene 1 je Design ein Blatt, Ebene 2 die Farben eines Designs, Klick: Fokus.
 * Fläche: alle Stiefel auf dem Flächen-Layout der Engine, Kamera auf fester Achse, wischen.
 */
export function App() {
  const [designs, setDesigns] = useState<Design[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [design, setDesign] = useState<Design | null>(null);
  const [focus, setFocus] = useState(-1);
  const [current, setCurrent] = useState(-1);
  const [view, setView] = useState<EngineView>(() =>
    (({ wall: 'wall', band: 'wall', floor: 'floor' } as Record<string, EngineView>)[new URLSearchParams(window.location.search).get('view') ?? ''] ?? 'bloom'));
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    loadDesigns().then((all) => {
      setDesigns(all);
      const wanted = new URLSearchParams(window.location.search).get('design');
      const hit = wanted ? all.find((d) => d.name.toLowerCase() === wanted.toLowerCase()) : undefined;
      if (hit) setDesign(hit);
    }).catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    if (!designs) return;
    const url = new URL(window.location.href);
    if (design) url.searchParams.set('design', design.name); else url.searchParams.delete('design');
    if (view !== 'bloom') url.searchParams.set('view', view); else url.searchParams.delete('view');
    window.history.replaceState(null, '', url);
  }, [designs, design, view]);

  const shoes: Shoe[] = useMemo(() => (designs ?? []).flatMap((d) => d.shoes), [designs]);
  const images = useMemo(() => shoes.map((s) => s.image), [shoes]);
  // Instanz i < Anzahl Stiefel = der Stiefel selbst; danach Wiederholungen, gestreut
  const instanceProduct = useMemo(() => {
    const n = shoes.length;
    if (!n) return [];
    return Array.from({ length: Math.max(WALL_COUNT, n) }, (_, i) => (i < n ? i : (i * 7 + Math.floor(i / n) * 3) % n));
  }, [shoes]);
  const bloomProducts = useMemo(() => {
    if (!designs) return [];
    if (design) return design.shoes.map((s) => shoes.indexOf(s));
    return designs.map((d) => shoes.indexOf(d.shoes[0]));
  }, [designs, design, shoes]);

  const switchTo = useCallback((next: Design | null) => {
    setFocus(-1);
    window.clearTimeout(timer.current);
    setDesign(next);
  }, []);

  const onPick = useCallback((instance: number) => {
    if (instance < 0) { setFocus(-1); return; }
    if (view !== 'bloom') { setFocus((f) => (f === instance ? -1 : instance)); return; }
    if (!designs) return;
    if (!design) {
      const d = designs.find((x) => shoes.indexOf(x.shoes[0]) === instance);
      if (!d) return;
      switchTo(d);
      if (d.shoes.length === 1) timer.current = window.setTimeout(() => setFocus(instance), 1900);
      return;
    }
    setFocus((f) => (f === instance ? -1 : instance));
  }, [designs, design, shoes, view, switchTo]);

  const shoe = focus >= 0 ? shoes[instanceProduct[focus]] : null;
  const front = view !== 'bloom' && current >= 0 ? shoes[instanceProduct[current]] : null;

  return (
    <div className="stage">
      <header className="caption">
        <div className="label">_MODEL:</div>
        <div className="model">{shoe ? `${shoe.design} · ${shoe.color}` : front ? `${front.design} · ${front.color}` : design ? design.name : "O'NEAL BOOTS 2028"}</div>
        <div className="label">_ACTION:</div>
        <div className="action">{design || view !== 'bloom' ? 'CUSTOMIZE' : 'CHOOSE'}</div>
      </header>

      <div className="views" role="tablist">
        <button className={view === 'bloom' ? 'on' : ''} onClick={() => { setFocus(-1); setView('bloom'); }}>Blüte</button>
        <button className={view === 'wall' ? 'on' : ''} onClick={() => { setFocus(-1); setView('wall'); }}>Fläche V1</button>
        <button className={view === 'floor' ? 'on' : ''} onClick={() => { setFocus(-1); setView('floor'); }}>Fläche Perspektive</button>
      </div>

      {design && view === 'bloom' && (
        <button className="back" onClick={() => switchTo(null)}>← Alle Stiefel</button>
      )}

      <Canvas camera={{ position: [0, 0, 9.5], fov: 35 }} dpr={[1, 2]} gl={{ antialias: true }}>
        <Suspense fallback={null}>
          {instanceProduct.length > 0 && (
            <EngineScene images={images} instanceProduct={instanceProduct} view={view} bloomProducts={bloomProducts}
                         focus={focus} onPick={onPick} onCurrent={setCurrent} />
          )}
        </Suspense>
      </Canvas>

      {design && view === 'bloom' && (
        <nav className="swatches">
          {design.shoes.map((s) => {
            const idx = shoes.indexOf(s);
            return (
              <button key={s.id} className={idx === focus ? 'swatch active' : 'swatch'} title={s.color}
                      onClick={() => setFocus(idx === focus ? -1 : idx)}>
                <img src={s.image.replace('width=640', 'width=120')} alt={s.color} />
                <span>{s.color}</span>
              </button>
            );
          })}
        </nav>
      )}

      {shoe && (
        <aside className="panel">
          <h2>{shoe.design}</h2>
          <div className="color">{shoe.color}</div>
          {shoe.price != null && <div className="price">{shoe.price.toFixed(2).replace('.', ',')} €</div>}
          {shoe.sizes.length > 0 && (
            <div className="sizes">
              {shoe.sizes.map((s) => (
                <span key={s} className={shoe.sizesInStock.includes(s) ? 'size' : 'size out'}>{s}</span>
              ))}
            </div>
          )}
          <div className="hint">Größen grau: derzeit nicht lagernd</div>
        </aside>
      )}

      {!designs && !error && <div className="loading">Lade Stiefel …</div>}
      {error && <div className="loading">{error}</div>}
      {designs && !shoe && view === 'bloom' && !design && <div className="hint-bottom">Tippe auf einen Stiefel, um seine Farben aufblühen zu lassen</div>}
      {designs && !shoe && view !== 'bloom' && <div className="hint-bottom">Wischen fährt die Fläche entlang, Tippen holt einen Stiefel nach vorn</div>}
    </div>
  );
}
