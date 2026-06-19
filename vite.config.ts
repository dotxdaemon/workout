import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    // Run test files sequentially: the IndexedDB-seeding screen tests are timing
    // sensitive, and cross-file CPU contention can starve their async setup.
    fileParallelism: false,
  },
})
