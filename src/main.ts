import { Router } from '@effect/ui'
import { Console, Effect, Layer } from 'effect'

import { BrowserHost, BrowserRouter } from '@effect/ui/html'

import { readFoundEggs } from './eggs/storage.ts'
import { Viewport } from './horde/services/Viewport.ts'
import { SiteRoute } from './routes.ts'
import { Site } from './Site.ts'
import './styles/reset.css'

const greetDevtools = Effect.andThen(
  Console.log('%cHey, you opened devtools.', 'font:700 14px monospace;color:#ffd166'),
  Console.log(
    'Type tanner.hello() to say hi. There are a few more things hidden on the page.',
  ),
)

const main = Effect.gen(function* () {
  yield* greetDevtools
  const found = yield* readFoundEggs
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
  const props = Effect.map(Router.currentRoute(SiteRoute), route => ({
    found,
    reducedMotion,
    route,
  }))
  return yield* Layer.launch(
    BrowserHost.mount(Site, props, document.getElementById('app')!).pipe(
      Layer.provide([BrowserRouter.layer({ routes: SiteRoute }), Viewport.browser]),
    ),
  )
})

Effect.runFork(main)
