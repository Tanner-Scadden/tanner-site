import { Router } from '@effect/ui'
import { Effect, Layer } from 'effect'

import { BrowserHost, BrowserRouter } from '@effect/ui/html'

import { readFoundEggs } from './eggs'
import { SiteRoute } from './routes'
import { Site } from './Site'
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
  return yield* Layer.launch(
    BrowserHost.mount(Site, props, document.getElementById('app')!).pipe(
      Layer.provide(BrowserRouter.layer({ routes: SiteRoute })),
    ),
  )
})

Effect.runFork(main)
