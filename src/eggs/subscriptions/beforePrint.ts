import { Subscription } from '@effect/ui'
import { Effect, Queue, Stream } from 'effect'

// NOTE: HtmlSubscription.onWindow only knows focus and blur.
export const beforePrint = <Msg>(message: Msg) =>
  Subscription.make(
    'beforeprint',
    Stream.callback<Msg>(queue =>
      Effect.acquireRelease(
        Effect.sync(() => {
          const listener = () => Queue.offerUnsafe(queue, message)
          window.addEventListener('beforeprint', listener)
          return listener
        }),
        listener =>
          Effect.sync(() => {
            window.removeEventListener('beforeprint', listener)
          }),
      ),
    ),
  )
