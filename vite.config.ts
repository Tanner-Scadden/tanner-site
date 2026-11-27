import stylex from '@stylexjs/unplugin/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  base: '/',
  plugins: [stylex()],
})
