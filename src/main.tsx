import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import AnnotationTester from './pages/AnnotationTester.tsx'

const isAnnot = typeof window !== 'undefined' && (window.location.pathname === '/annot' || new URLSearchParams(window.location.search).get('annot') === '1')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isAnnot ? <AnnotationTester /> : <App />}
  </StrictMode>,
)
