import { fileURLToPath } from 'node:url'

import { Effect } from 'effect'
import { type Plugin, type ViteDevServer, createServer, defineConfig } from 'vite'

import { stylex } from './vite.plugins.ts'

import type * as Blog from './src/content/blog.ts'
import type * as Head from './src/seo/head.ts'

const loader = Effect.acquireRelease(
  Effect.promise(() =>
    createServer({
      configFile: false,
      root: fileURLToPath(new URL('.', import.meta.url)),
      mode: 'production',
      plugins: [stylex()],
      server: { middlewareMode: true, hmr: false, ws: false },
      appType: 'custom',
      logLevel: 'error',
    }),
  ),
  server => Effect.promise(() => server.close()),
)

const load = <A>(server: ViteDevServer, path: string): Effect.Effect<A> =>
  // oxlint-disable-next-line effect/noAs -- ssrLoadModule returns an untyped module; A is the type of the source file it loads
  Effect.promise(() => server.ssrLoadModule(path) as Promise<A>)

const seo = (): Plugin => ({
  name: 'seo',
  apply: 'build',
  enforce: 'post',
  generateBundle(_, bundle) {
    const index = bundle['index.html']
    if (index?.type !== 'asset') return this.error('seo: the build has no index.html')
    const html = String(index.source)
    return Effect.runPromise(
      Effect.scoped(
        Effect.gen({ self: this }, function* () {
          const server = yield* loader
          const { PUBLISHED } = yield* load<typeof Blog>(server, '/src/content/blog.ts')
          const head = yield* load<typeof Head>(server, '/src/seo/head.ts')
          for (const page of head.pagesOf(PUBLISHED)) {
            this.emitFile({ type: 'asset', fileName: page.file, source: head.withHead(html, page) })
          }
          this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: head.sitemap(PUBLISHED) })
        }),
      ),
    )
  },
})

export default defineConfig({
  base: '/',
  plugins: [stylex(), seo()],
})
