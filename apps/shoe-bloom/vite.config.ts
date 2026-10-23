import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// Prototyp „Schuh-Blume“ (Content-Post #5635): eigene Seite unter /shoe-bloom/,
// Umgebungsvariablen (VITE_ONEAL_API_KEY) aus dem Repo-Root wie beim Finder.
// WAVE_ENGINE_SRC: Quelltext eines wave-engine-Zweigs statt des Pakets (für Engine-Änderungen vor der
// Veröffentlichung); three, React & Co. bleiben dabei die des Productfinders (dedupe).
const engineSrc = process.env.WAVE_ENGINE_SRC
export default defineConfig({
  root: __dirname,
  base: '/shoe-bloom/',
  envDir: path.resolve(__dirname, '../..'),
  plugins: [react()],
  resolve: {
    alias: engineSrc ? [{ find: /^@arkturian\/wave-engine$/, replacement: path.join(engineSrc, 'index.ts') }] : [],
    dedupe: ['three', 'react', 'react-dom', '@react-three/fiber', '@react-three/drei', 'gsap'],
  },
  server: {
    proxy: {
      '/oneal-api': { target: 'http://127.0.0.1:8004', changeOrigin: true, rewrite: (p) => p.replace(/^\/oneal-api/, '') },
      '/storage-api': { target: 'http://127.0.0.1:8001', changeOrigin: true, rewrite: (p) => p.replace(/^\/storage-api/, '') },
    },
  },
  build: { outDir: path.resolve(__dirname, '../../dist-shoe-bloom'), emptyOutDir: true, chunkSizeWarningLimit: 1500 },
})
