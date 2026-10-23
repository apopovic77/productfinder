import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { BloomScene, type Petal, type Phase } from './BloomScene';
import { loadDesigns, type Design } from './data';

/** Ebene 1: je Design ein Blatt. Ebene 2: die Farben eines Designs. Klick auf eine Farbe: Fokus. */
export function App() {
  const [designs, setDesigns] = useState<Design[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [design, setDesign] = useState<Design | null>(null);
  const [phase, setPhase] = useState<Phase>('bud');
  const [focus, setFocus] = useState(-1);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    loadDesigns().then((all) => {
      setDesigns(all);
      // Direktlink: ?design=<Name>
      const wanted = new URLSearchParams(window.location.search).get('design');
      const hit = wanted ? all.find((d) => d.name.toLowerCase() === wanted.toLowerCase()) : undefined;
      if (hit) setDesign(hit);
    }).catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    if (!designs) return; // erst nach dem Laden, sonst geht der Direktlink verloren
    const url = new URL(window.location.href);
    if (design) url.searchParams.set('design', design.name); else url.searchParams.delete('design');
    window.history.replaceState(null, '', url);
  }, [designs, design]);

  const petals: Petal[] = useMemo(() => {
    if (!designs) return [];
    if (design) return design.shoes.map((s) => ({ key: s.id, image: s.image }));
    return designs.map((d) => ({ key: d.name, image: d.shoes[0].image }));
  }, [designs, design]);

  // nach jedem Wechsel der Ebene aus der Knospe aufblühen
  useEffect(() => {
    if (!petals.length) return;
    setPhase('bud');
    const t = window.setTimeout(() => setPhase('open'), 350);
    return () => window.clearTimeout(t);
  }, [petals]);

  const switchTo = useCallback((next: Design | null) => {
    setFocus(-1);
    setPhase('bud');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setDesign(next), 480);
  }, []);

  const onPick = useCallback((i: number) => {
    if (!designs) return;
    if (!design) {
      const d = designs[i];
      if (d.shoes.length === 1) {
        // ein Design mit nur einer Farbe: gleich in den Fokus
        setDesign(d);
        setTimeout(() => setFocus(0), 900);
      } else switchTo(d);
      return;
    }
    setFocus((f) => (f === i ? -1 : i));
  }, [designs, design, switchTo]);

  const shoe = design && focus >= 0 ? design.shoes[focus] : null;

  return (
    <div className="stage">
      <header className="caption">
        <div className="label">_MODEL:</div>
        <div className="model">{design ? design.name : "O'NEAL BOOTS 2028"}</div>
        <div className="label">_ACTION:</div>
        <div className="action">{design ? 'CUSTOMIZE' : 'CHOOSE'}</div>
      </header>

      {design && (
        <button className="back" onClick={() => switchTo(null)}>← Alle Stiefel</button>
      )}

      <Canvas camera={{ position: [0, 0, 9], fov: 35 }} dpr={[1, 2]} onPointerMissed={() => setFocus(-1)}>
        <Suspense fallback={null}>
          {petals.length > 0 && <BloomScene petals={petals} phase={phase} focus={focus} onPick={onPick} />}
        </Suspense>
      </Canvas>

      {design && (
        <nav className="swatches">
          {design.shoes.map((s, i) => (
            <button key={s.id} className={i === focus ? 'swatch active' : 'swatch'} onClick={() => setFocus(i === focus ? -1 : i)}
                    title={s.color}>
              <img src={s.image.replace('width=640', 'width=120')} alt={s.color} />
              <span>{s.color}</span>
            </button>
          ))}
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
      {!design && designs && <div className="hint-bottom">Tippe auf einen Stiefel, um seine Farben aufblühen zu lassen</div>}
    </div>
  );
}
