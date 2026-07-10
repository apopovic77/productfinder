import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import AnnotationTester from './pages/AnnotationTester.tsx'
import GpaneDoku from './pages/GpaneDoku.tsx'
import { ProductFinderV2 } from './v2/ProductFinderV2.tsx'
import { ProductFinderV3 } from './v3/ProductFinderV3.tsx'
import { CartDemo } from './pages/CartDemo.tsx'
import { PreloaderProvider } from './libs/react-asset-preloader'
import { AppPreloaderWrapper } from './components/AppPreloaderWrapper'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/v2" element={<ProductFinderV2 />} />
        <Route path="/v3" element={<ProductFinderV3 />} />
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
          <AppPreloaderWrapper>
            <App />
          </AppPreloaderWrapper>
        } />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
