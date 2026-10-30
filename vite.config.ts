import { defineConfig } from 'vite-plus'

export default defineConfig({
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'node',
    testTimeout: 15000,
  },
})
