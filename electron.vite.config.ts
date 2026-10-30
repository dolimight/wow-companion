import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'node:path'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: { sourcemap: true, rollupOptions: { input: { index: resolve('src/main/index.ts'), 'database-worker': resolve('src/workers/database/entry.ts'), 'gamedata-worker': resolve('src/workers/gamedata/entry.ts'), 'progression-worker': resolve('src/workers/progression/entry.ts') } } },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: { rollupOptions: { input: resolve('src/preload/index.ts'), output: { format: 'cjs', entryFileNames: 'index.cjs' } } },
  },
  renderer: {
    plugins: [react(), tailwindcss()],
    publicDir: resolve('public'),
    resolve: { alias: { '@': resolve('src/renderer'), '@shared': resolve('src/shared') } },
    build: { sourcemap: true, rollupOptions: { input: resolve('src/renderer/index.html') } },
  },
})
