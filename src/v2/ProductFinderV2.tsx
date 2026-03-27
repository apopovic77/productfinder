/**
 * ProductFinder v2 — Main Component
 *
 * GPU-instanced product rendering on the Arcturian 3D Engine.
 * Uses Zustand store + GPANE Engine + PivotLayouter.
 * Route: /v2
 */
import { useEffect, useCallback, useRef } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { MapControls } from '@react-three/drei';
import { CameraLight } from '@arcturian';
import { ProductFinderScene } from './ProductFinderScene';
import { useProductFinderStore } from './store/useProductFinderStore';
import { OverlayLayer } from './overlays/OverlayLayer';
import { BucketProjector } from './hooks/useBucketProjection';

function ResizeHandler() {
  const { size } = useThree();
  const resize = useProductFinderStore(s => s.resize);
  useEffect(() => { resize(size.width, size.height); }, [size.width, size.height, resize]);
  return null;
}

export function ProductFinderV2() {
  const {
    layoutItems, loading, error, breadcrumbs, activeDimension,
    availableDimensions, heroMode, buckets, mode, products,
    hoveredProductId, selectedProduct, transitioning,
    loadProducts, drillDown, drillUp, reset, selectDimension,
    setHovered, selectProduct,
  } = useProductFinderStore();

  const containerRef = useRef<HTMLDivElement>(null);

  // Load products on mount
  useEffect(() => { loadProducts(); }, [loadProducts]);

  const handleProductClick = useCallback((id: string) => {
    const product = useProductFinderStore.getState()._service.getProductById(id);
    if (product) {
      selectProduct(selectedProduct?.id === id ? null : product);
    }
  }, [selectProduct, selectedProduct]);

  const handleProductHover = useCallback((id: string | null) => {
    setHovered(id);
  }, [setHovered]);

  const hoveredProduct = hoveredProductId
    ? useProductFinderStore.getState()._service.getProductById(hoveredProductId) || null
    : null;

  const handleBucketClick = useCallback((bucketLabel: string) => {
    drillDown(bucketLabel);
  }, [drillDown]);

  const handleBreadcrumbClick = useCallback((index: number) => {
    const depth = breadcrumbs.length - 1;
    if (index === 0) {
      reset();
    } else {
      // Navigate back to specific level
      const levelsToGoBack = depth - index;
      for (let i = 0; i < levelsToGoBack; i++) {
        drillUp();
      }
    }
  }, [breadcrumbs, reset, drillUp]);

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', height: '100vh', background: '#0a0a0a' }}>
      <Canvas
        orthographic
        camera={{
          zoom: 8,
          position: [0, 0, 100],
          near: 0.1,
          far: 200,
        }}
        gl={{ antialias: true, alpha: false }}
        style={{ width: '100%', height: '100%' }}
      >
        <color attach="background" args={['#0a0a0a']} />
        <ambientLight intensity={0.8} />
        <CameraLight intensity={2.0} />

        <ResizeHandler />

        <ProductFinderScene
          layoutItems={layoutItems}
          onProductClick={handleProductClick}
          onProductHover={handleProductHover}
          transitionDuration={0.6}
        />

        <BucketProjector />

        <MapControls
          enableRotate={false}
          enableDamping
          dampingFactor={0.1}
          zoomSpeed={0.5}
          minZoom={1}
          maxZoom={80}
        />
      </Canvas>

      {/* HTML Overlay Layer */}
      <OverlayLayer
        loading={loading}
        error={error}
        productCount={products.length}
        breadcrumbs={breadcrumbs}
        activeDimension={activeDimension}
        availableDimensions={availableDimensions}
        heroMode={heroMode}
        hoveredProductId={hoveredProductId}
        selectedProduct={selectedProduct}
        mode={mode}
        onBreadcrumbClick={handleBreadcrumbClick}
        onDimensionSelect={selectDimension}
        onDrillUp={drillUp}
        hoveredProduct={hoveredProduct}
        onProductClose={() => selectProduct(null)}
        onBucketClick={handleBucketClick}
      />
    </div>
  );
}
