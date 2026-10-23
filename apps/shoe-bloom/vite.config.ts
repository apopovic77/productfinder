import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// Prototyp „Schuh-Blume“ (Content-Post #5635): eigene Seite unter /shoe-bloom/,
// Umgebungsvariablen (VITE_ONEAL_API_KEY) aus dem Repo-Root wie beim Finder.
export default defineConfig({
  root: __dirname,
  base: '/shoe-bloom/',
  envDir: path.resolve(__dirname, '../..'),
  plugins: [react()],
  server: {
    proxy: {
      '/oneal-api': { target: 'http://127.0.0.1:8004', changeOrigin: true, rewrite: (p) => p.replace(/^\/oneal-api/, '') },
      '/storage-api': { target: 'http://127.0.0.1:8001', changeOrigin: true, rewrite: (p) => p.replace(/^\/storage-api/, '') },
    },
  },
  build: { outDir: path.resolve(__dirname, '../../dist-shoe-bloom'), emptyOutDir: true, chunkSizeWarningLimit: 1500 },
})
