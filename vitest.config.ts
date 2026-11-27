import stylex from '@stylexjs/unplugin/vite'
import { defineConfig } from 'vitest/config'

// NOTE: StyleX has no runtime, so the tests compile it as the build does.
export default defineConfig({
  plugins: [stylex()],
  test: { include: ['src/**/*.test.ts'] },
})
