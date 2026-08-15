import { StrictMode, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import AnnotationTester from './pages/AnnotationTester.tsx'
import GpaneDoku from './pages/GpaneDoku.tsx'
// v2/v3 are alternative GPU pipelines (issue #260) — lazy so the 1.1MB
// three.js vendor chunk never loads for normal visitors
const ProductFinderV2 = lazy(() => import('./v2/ProductFinderV2.tsx').then(m => ({ default: m.ProductFinderV2 })))
const ProductFinderV3 = lazy(() => import('./v3/ProductFinderV3.tsx').then(m => ({ default: m.ProductFinderV3 })))
import { CartDemo } from './pages/CartDemo.tsx'
import { PreloaderProvider } from './libs/react-asset-preloader'
import { AppPreloaderWrapper } from './components/AppPreloaderWrapper'
import { BrandSelectionGate } from './components/BrandSelectionGate'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/v2" element={<Suspense fallback={null}><ProductFinderV2 /></Suspense>} />
        <Route path="/v3" element={<Suspense fallback={null}><ProductFinderV3 /></Suspense>} />
        <Route path="/cart" element={<CartDemo />} />
        <Route path="/doku" element={<GpaneDoku />} />
        <Route path="/annot" element={
          <PreloaderProvider
            config={{
              minDisplayTime: 1000,
              showProgress: true,
              showCount: true,
              backgroundColor: '#000000',
              textColor: '#ffffff',
              blurBackdrop: true,
              onComplete: () => console.log('All assets loaded!'),
            }}
            autoStart={false}
          >
            <AnnotationTester />
          </PreloaderProvider>
        } />
        <Route path="*" element={
          <BrandSelectionGate>
            {({ brand, canChangeBrand, requestBrandSelection }) => (
              <AppPreloaderWrapper brand={brand}>
                <App
                  brand={brand}
                  canChangeBrand={canChangeBrand}
                  onRequestBrandSelection={requestBrandSelection}
                />
              </AppPreloaderWrapper>
            )}
          </BrandSelectionGate>
        } />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
