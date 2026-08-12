import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react()],
    base: env.VITE_BASE_PATH || '/',
    resolve: {
      alias: {
        '@arcturian': path.resolve(__dirname, 'libs/arcturian/src/engine'),
      },
    },
    server: {
      allowedHosts: ['productfinder-dev.oneal.arkturian.com'],
      proxy: {
        // Mirror the nginx same-origin contracts for local Playwright/dev.
        '/oneal-api': {
          target: 'http://127.0.0.1:8004',
          changeOrigin: true,
          rewrite: (requestPath) => requestPath.replace(/^\/oneal-api/, ''),
        },
        '/storage-api': {
          target: 'http://127.0.0.1:8001',
          changeOrigin: true,
          rewrite: (requestPath) => requestPath.replace(/^\/storage-api/, ''),
        },
      },
    },
    build: {
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-react': ['react', 'react-dom'],
            'vendor-framer': ['framer-motion'],
            'vendor-three': ['three', '@react-three/fiber', '@react-three/drei'],
          },
        },
      },
    },
  }
})
