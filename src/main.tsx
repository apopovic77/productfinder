import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import AnnotationTester from './pages/AnnotationTester.tsx'
import GpaneDoku from './pages/GpaneDoku.tsx'
import { PreloaderProvider, PreloaderOverlay } from './libs/react-asset-preloader'
import { AppPreloaderWrapper } from './components/AppPreloaderWrapper'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
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
            <PreloaderOverlay
              message="Loading Product Images..."
              backgroundVideoStorageId={6617}
              logoStorageId={6615}
            />
            <AppPreloaderWrapper>
              <App />
            </AppPreloaderWrapper>
          </PreloaderProvider>
        } />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
