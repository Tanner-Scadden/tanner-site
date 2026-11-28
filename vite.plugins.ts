import stylexPlugin from '@stylexjs/unplugin/vite'
import type { PluginOption } from 'vite'

// oxlint-disable-next-line typescript/no-unsafe-return -- @stylexjs/unplugin types its Vite plugin as any
export const stylex = (): PluginOption => stylexPlugin()
