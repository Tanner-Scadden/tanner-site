import { Effect, Queue, Stream } from 'effect'
import { constVoid } from 'effect/Function'


export const resizes = (elements: ReadonlyArray<Element>): Stream.Stream<void> =>
  Stream.callback<ReadonlyArray<ResizeObserverEntry>>(queue =>
    Effect.acquireRelease(
      Effect.sync(() => {
        const observer = new ResizeObserver(entries => Queue.offerUnsafe(queue, entries))
        for (const element of elements) observer.observe(element)
        return observer
      }),
      observer => Effect.sync(() => observer.disconnect()),
    ),
  ).pipe(Stream.map(constVoid))

export const visibility = (element: Element): Stream.Stream<boolean> =>
  Stream.callback<boolean>(queue =>
    Effect.acquireRelease(
      Effect.sync(() => {
        const observer = new IntersectionObserver(entries => {
          for (const entry of entries) Queue.offerUnsafe(queue, entry.isIntersecting)
        })
        observer.observe(element)
        return observer
      }),
      observer => Effect.sync(() => observer.disconnect()),
    ),
  )

export const fontsReady: Stream.Stream<void> = Stream.fromEffect(
  Effect.promise(() => document.fonts.ready).pipe(Effect.asVoid),
)

export const prefersStill = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches
