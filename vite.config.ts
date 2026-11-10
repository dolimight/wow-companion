import { resolve } from 'node:path'
import { defineConfig } from 'vite-plus'

export default defineConfig({
  // Same aliases as the renderer build, so tests can load shadcn components that import through '@'
  resolve: { alias: { '@': resolve('src/renderer'), '@shared': resolve('src/shared') } },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'node',
    testTimeout: 15000,
  },
})
