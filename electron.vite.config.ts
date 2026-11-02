import { cpSync } from 'node:fs'
import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/main/index.ts'),
          'parser-worker': resolve('src/main/parser-worker.ts')
        }
      }
    },
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: { '@shared': resolve('src/shared') } }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: { '@shared': resolve('src/shared') } }
  },
  renderer: {
    publicDir: resolve('node_modules/.cache/maoxuan-renderer-public'),
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared': resolve('src/shared')
      }
    },
    plugins: [
      react(),
      {
        name: 'journal-editor-assets',
        buildStart() {
          const destination = resolve('node_modules/.cache/maoxuan-renderer-public/vditor/dist')
          cpSync(resolve('node_modules/vditor/dist'), destination, { recursive: true })
        }
      }
    ]
  }
})
