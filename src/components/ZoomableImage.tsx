import React, { useEffect, useRef, useState } from 'react';

/**
 * Produktbild im Detail-Dialog mit Zoom (owner 2026-09-29, media 128484):
 * Scrollrad bzw. Trackpad-Pinch zoomt zum Mauszeiger, Doppelklick schaltet
 * zwischen 1x und 2,5x, gezoomt verschiebt Ziehen das Bild. Zoom setzt sich
 * beim Bildwechsel zurueck.
 */
const MAX_SCALE = 5;

type View = { scale: number; x: number; y: number };
const RESET: View = { scale: 1, x: 0, y: 0 };

export function ZoomableImage({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [view, setView] = useState<View>(RESET);
  const drag = useRef<{ px: number; py: number; x: number; y: number } | null>(null);

  useEffect(() => { setView(RESET); }, [src]);

  // Zoom um einen Punkt (Koordinaten relativ zur Bildmitte), Verschiebung
  // so begrenzt, dass das Bild die Flaeche nicht verlaesst.
  const zoomAt = (prev: View, nextScale: number, cx: number, cy: number): View => {
    const box = boxRef.current;
    const scale = Math.min(MAX_SCALE, Math.max(1, nextScale));
    if (!box || scale === 1) return RESET;
    const k = scale / prev.scale;
    return clamp({ scale, x: cx - (cx - prev.x) * k, y: cy - (cy - prev.y) * k }, box);
  };

  // wheel muss non-passive sein, sonst scrollt der Dialog mit.
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = box.getBoundingClientRect();
      const cx = e.clientX - r.left - r.width / 2;
      const cy = e.clientY - r.top - r.height / 2;
      const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0025));
      setView(prev => zoomAt(prev, prev.scale * factor, cx, cy));
    };
    box.addEventListener('wheel', onWheel, { passive: false });
    return () => box.removeEventListener('wheel', onWheel);
  }, []);

  const onDoubleClick = (e: React.MouseEvent) => {
    const r = e.currentTarget.getBoundingClientRect();
    const cx = e.clientX - r.left - r.width / 2;
    const cy = e.clientY - r.top - r.height / 2;
    setView(prev => (prev.scale > 1 ? RESET : zoomAt(prev, 2.5, cx, cy)));
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (view.scale <= 1) return;
    drag.current = { px: e.clientX, py: e.clientY, x: view.x, y: view.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    const box = boxRef.current;
    if (!d || !box) return;
    setView(prev => clamp({ ...prev, x: d.x + e.clientX - d.px, y: d.y + e.clientY - d.py }, box));
  };
  const onPointerUp = () => { drag.current = null; };

  const zoomed = view.scale > 1;
  return (
    <div
      ref={boxRef}
      className={`pf-zoom-box ${zoomed ? 'is-zoomed' : ''} ${className ?? ''}`}
      onDoubleClick={onDoubleClick}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      title={zoomed ? 'Doppelklick: zurück · Ziehen: verschieben' : 'Scrollen oder Doppelklick zum Zoomen'}
    >
      <img
        src={src}
        alt={alt}
        draggable={false}
        style={{
          transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
          transition: drag.current ? 'none' : 'transform 0.12s ease-out',
        }}
      />
    </div>
  );
}

function clamp(v: View, box: HTMLElement): View {
  const maxX = (box.clientWidth * (v.scale - 1)) / 2;
  const maxY = (box.clientHeight * (v.scale - 1)) / 2;
  return {
    scale: v.scale,
    x: Math.min(maxX, Math.max(-maxX, v.x)),
    y: Math.min(maxY, Math.max(-maxY, v.y)),
  };
}
