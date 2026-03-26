/**
 * ProductFinder v2 — Main Component
 *
 * GPU-instanced product rendering powered by Arcturian engine concepts.
 * Drop-in replacement for the v1 Canvas renderer.
 */
import { useState, useEffect, useCallback } from 'react';
import { Canvas } from '@react-three/fiber';
import { MapControls } from '@react-three/drei';
import { ProductFinderScene } from './ProductFinderScene';
import type { LayoutItem } from './render/PivotLayoutAdapter';

const ONEAL_API = (import.meta as any).env?.VITE_ONEAL_API_BASE || 'https://gsgbot.arkturian.com/oneal-api/v1';
const API_KEY = (import.meta as any).env?.VITE_ONEAL_API_KEY || 'oneal_demo_token';

export function ProductFinderV2() {
  const [layoutItems, setLayoutItems] = useState<LayoutItem[]>([]);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [productCount, setProductCount] = useState(0);

  useEffect(() => { loadProducts(); }, []);

  const loadProducts = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${ONEAL_API}/products?limit=2000`, {
        headers: { 'X-API-Key': API_KEY },
      });
      if (!res.ok) throw new Error(`API ${res.status}`);
      const data = await res.json();
      const items = data.results || [];
      setProductCount(items.length);

      // Simple grid layout (PoC — will be replaced by PivotLayouter)
      const cellSize = 70;
      const gap = 4;
      const cols = Math.ceil(Math.sqrt(items.length));

      const mapped: LayoutItem[] = items.map((p: any, i: number) => ({
        id: String(p.id),
        posX: (i % cols) * (cellSize + gap),
        posY: -Math.floor(i / cols) * (cellSize + gap),
        width: cellSize,
        height: cellSize,
        opacity: 1.0,
        atlasIndex: i,
        storageId: p.storage?.id,
      }));

      setLayoutItems(mapped);
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
      setLoading(false);
    }
  };

  const handleProductClick = useCallback((id: string) => {
    setSelectedId(prev => prev === id ? null : id);
  }, []);

  const handleProductHover = useCallback((id: string | null) => {
    setHoveredId(id);
  }, []);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100vh', background: '#0a0a0a' }}>
      <Canvas
        orthographic
        camera={{ zoom: 1, position: [0, 0, 100], near: 0.1, far: 200 }}
        gl={{ antialias: true, alpha: false }}
        style={{ width: '100%', height: '100%' }}
      >
        <color attach="background" args={['#0a0a0a']} />

        <ProductFinderScene
          layoutItems={layoutItems}
          onProductClick={handleProductClick}
          onProductHover={handleProductHover}
        />

        <MapControls
          enableRotate={false}
          enableDamping
          dampingFactor={0.1}
          zoomSpeed={0.5}
          minZoom={0.1}
          maxZoom={10}
        />
      </Canvas>

      {/* HUD Overlay */}
      <div style={{
        position: 'absolute', top: 16, left: 16,
        color: '#fff', fontFamily: "'ITC Avant Garde Gothic', system-ui, sans-serif",
        fontSize: 13, pointerEvents: 'none',
      }}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>
          ProductFinder <span style={{ color: '#58a6ff' }}>v2</span>
        </div>
        <div style={{ opacity: 0.5 }}>
          {loading ? 'Loading...' : error ? `Error: ${error}` : `${productCount} products · GPU instanced`}
        </div>
        {hoveredId && (
          <div style={{ color: '#58a6ff', marginTop: 4 }}>Hover: {hoveredId}</div>
        )}
        {selectedId && (
          <div style={{ color: '#3fb950', marginTop: 4 }}>Selected: {selectedId}</div>
        )}
      </div>
    </div>
  );
}
