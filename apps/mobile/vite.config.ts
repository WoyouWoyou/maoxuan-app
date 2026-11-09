import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom', 'react-router-dom'],
    alias: {
      '@shared': fileURLToPath(new URL('../../src/shared', import.meta.url)),
      '@renderer': fileURLToPath(new URL('../../src/renderer/src', import.meta.url)),
      'react-router-dom': fileURLToPath(
        new URL('./node_modules/react-router-dom/dist/index.mjs', import.meta.url)
      ),
      'react-markdown': fileURLToPath(
        new URL('./node_modules/react-markdown/index.js', import.meta.url)
      ),
      vditor: fileURLToPath(new URL('./node_modules/vditor', import.meta.url))
    }
  },
  base: './',
  server: { port: 5174, strictPort: true, fs: {allow:[fileURLToPath(new URL('../../',import.meta.url))]} }
})
