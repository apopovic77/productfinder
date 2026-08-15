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
        // bypass the package exports map: deep imports keep three out of
        // the eager bundle (the barrel re-exports three-dependent types)
        'arkturian-typescript-utils/dist': path.resolve(__dirname, 'node_modules/arkturian-typescript-utils/dist'),
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
            // NOTE: no manual three chunk — the object-syntax manualChunk
            // became a static entry import and preloaded 1.1MB for every
            // visitor although only lazy routes (v2/v3/arcturian) use three.
            // Rollup now splits three naturally into the lazy chunks.
          },
        },
      },
    },
  }
})
