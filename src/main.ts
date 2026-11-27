import { Router } from '@effect/ui'
import { Effect, Layer } from 'effect'

import { BrowserHost, BrowserRouter } from '@effect/ui/html'

import { readFoundEggs } from './eggs/storage.ts'
import { Viewport } from './horde/services/Viewport.ts'
import { SiteRoute } from './routes.ts'
import { restoreScrollOnReload, saveScrollOnHide } from './site/reloadScroll.ts'
import { Site } from './Site.ts'
import './styles.css'

// NOTE: the devtools egg starts as plain console output on purpose: styled
// text in the console, where Effect's logger would add its own prefix.
const greetDevtools = Effect.sync(() => {
  // @effect-diagnostics-next-line globalConsoleInEffect:off
  console.log(
    '%cHey, you opened devtools.',
    'font:700 14px monospace;color:#ffd166',
  )
  // @effect-diagnostics-next-line globalConsoleInEffect:off
  console.log(
    'Type tanner.hello() to say hi. There are a few more things hidden on the page.',
  )
})

const main = Effect.gen(function* () {
  yield* greetDevtools
  const found = yield* readFoundEggs
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
  // NOTE: the first route comes from the Router; every later one arrives as
  // a message through the root's Router subscription.
  const props = Effect.map(Router.currentRoute(SiteRoute), route => ({
    found,
    reducedMotion,
    route,
  }))
  yield* saveScrollOnHide
  yield* Layer.build(
    BrowserHost.mount(Site, props, document.getElementById('app')!).pipe(
      Layer.provide([BrowserRouter.layer({ routes: SiteRoute }), Viewport.browser]),
    ),
  )
  // NOTE: after the mount, so the page is tall enough to scroll back into.
  yield* restoreScrollOnReload
  return yield* Effect.never
}).pipe(Effect.scoped)

Effect.runFork(main)
