import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import AnnotationTester from './pages/AnnotationTester.tsx'
import { PreloaderProvider, PreloaderOverlay } from './libs/react-asset-preloader'
import { AppPreloaderWrapper } from './components/AppPreloaderWrapper'

const isAnnot = typeof window !== 'undefined' && (window.location.pathname === '/annot' || new URLSearchParams(window.location.search).get('annot') === '1')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
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
        {isAnnot ? <AnnotationTester /> : <App />}
      </AppPreloaderWrapper>
    </PreloaderProvider>
  </StrictMode>,
)
