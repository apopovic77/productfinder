import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@presenter/InterpolatedProperty': path.resolve(__dirname, '../3dPresenter2/src/engine/properties/InterpolatedProperty.ts'),
      '@presenter/Vector2': path.resolve(__dirname, '../3dPresenter2/src/engine/types/Vector2.ts'),
    },
  },
})
