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
import { CatalogLanguageGate } from './components/CatalogLanguageGate'
import { CatalogNavigationGate } from './components/CatalogNavigationGate'
import { CATALOG_ENTRY_CONFIG, resolveCatalogFlow, resolveCategoryPresentation } from './config/CatalogEntryConfig'
import { REALTIME_DEMO_ENABLED } from './config/apiConfig'

// Flow-Variante (?flow=guided|open|direct): welche Taxonomie-Stufen werden
// als geführte Grafik-Gates präsentiert (owner 2026-08-25). Einmal beim
// Bootstrap gelesen — ein Wechsel ist ein Reload mit anderem Query-Param.
const catalogFlow = resolveCatalogFlow()
// Kategorie-Ebene als Gate-Seite oder direkt als Finder-Sicht (?catview=…)
const categoryPresentation = resolveCategoryPresentation()
const normalizedPath = window.location.pathname.replace(/\/+$/, '') || '/'
const realtimeDemoEnabled = REALTIME_DEMO_ENABLED
  && normalizedPath === '/internal/realtime-demo'

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
          <CatalogLanguageGate>
            {({ locale, requestLanding }) => (
              <BrandSelectionGate locale={locale} enabled={catalogFlow.gates.includes('brand')}>
                {({ brand, canChangeBrand, requestBrandSelection }) => (
                  <CatalogNavigationGate
                    brand={brand}
                    locale={locale}
                    canChangeBrand={canChangeBrand}
                    sportGate={catalogFlow.gates.includes('sport')}
                    categoryGate={catalogFlow.gates.includes('category') && categoryPresentation === 'gate'}
                    smartGates={catalogFlow.smartGates !== false}
                    onRequestBrandSelection={requestBrandSelection}
                    onRequestLanding={requestLanding}
                  >
                    {({
                      selection,
                      sportLabel,
                      categoryLabel,
                      requestSportSelection,
                      requestCategorySelection,
                    }) => (
                      <AppPreloaderWrapper
                        key={`${brand ?? 'all'}:${selection?.sportId ?? 'all'}:${selection?.categoryId ?? 'all'}`}
                        brand={brand}
                        entrySelection={selection}
                      >
                        <App
                          brand={brand}
                          canChangeBrand={canChangeBrand}
                          onRequestBrandSelection={requestBrandSelection}
                          locale={locale}
                          catalogYear={CATALOG_ENTRY_CONFIG.year}
                          entrySelection={selection}
                          sportLabel={sportLabel}
                          categoryLabel={categoryLabel}
                          onRequestCatalogLanding={requestLanding}
                          onRequestSportSelection={requestSportSelection}
                          onRequestCategorySelection={requestCategorySelection}
                          realtimeDemoEnabled={realtimeDemoEnabled}
                          realtimeDemoAvailable={REALTIME_DEMO_ENABLED}
                        />
                      </AppPreloaderWrapper>
                    )}
                  </CatalogNavigationGate>
                )}
              </BrandSelectionGate>
            )}
          </CatalogLanguageGate>
        } />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
