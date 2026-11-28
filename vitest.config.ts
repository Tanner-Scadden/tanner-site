import { defineConfig } from 'vitest/config'

import { stylex } from './vite.plugins.ts'

const DOM_TESTS = ['src/Site.test.ts', 'src/blog/highlight.test.ts']

export default defineConfig({
  plugins: [stylex()],
  test: {
    projects: [
      { extends: true, test: { name: 'node', include: ['src/**/*.test.ts'], exclude: DOM_TESTS } },
      { extends: true, test: { name: 'dom', include: DOM_TESTS, environment: 'happy-dom' } },
    ],
  },
})
