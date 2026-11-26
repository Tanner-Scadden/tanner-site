import * as Alchemy from 'alchemy'
import * as Effect from 'effect/Effect'
import * as Path from 'effect/Path'

import * as Cloudflare from '@alchemy.run/cloudflare'

const PRODUCTION_STAGE = 'prod'

const workerName = (stage: string): string =>
  stage === PRODUCTION_STAGE ? 'tanner-site' : `tanner-site-${stage}`

// NOTE: prod serves tannerscadden.com (www redirects to it). Other stages
// live on workers.dev only.
const DOMAIN = 'tannerscadden.com'

const Website = Effect.gen(function* () {
  const stage = yield* Alchemy.Stage
  const path = yield* Path.Path

  return yield* Cloudflare.Website.Vite('Website', {
    name: workerName(stage),
    rootDir: path.resolve(import.meta.dirname, '..'),
    // NOTE: every path serves index.html, and the Router picks the page.
    assets: { notFoundHandling: 'single-page-application' },
    domain:
      stage === PRODUCTION_STAGE
        ? { name: DOMAIN, redirects: [`www.${DOMAIN}`] }
        : null,
    memo: {
      include: ['src/**', 'public/**', 'index.html', 'vite.config.ts', 'package.json'],
      lockfile: true,
    },
  })
})

export default Alchemy.Stack(
  'tanner-site',
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const website = yield* Website
    return { url: website.url }
  }),
)
