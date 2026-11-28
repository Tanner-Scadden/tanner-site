import { Effect, Queue, Stream } from 'effect'

// What on the page a drawing watches, as streams that let go of their
// observers when they end.

// Once each time any of `elements` changes size.
export const resizes = (elements: ReadonlyArray<Element>): Stream.Stream<void> =>
  Stream.callback<void>(queue =>
    Effect.acquireRelease(
      Effect.sync(() => {
        const observer = new ResizeObserver(() => Queue.offerUnsafe(queue, undefined))
        for (const element of elements) observer.observe(element)
        return observer
      }),
      observer => Effect.sync(() => observer.disconnect()),
    ),
  )

// Whether `element` is on screen, each time that changes.
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

// Once, when the page's web fonts have landed, since they can reflow it.
export const fontsReady: Stream.Stream<void> = Stream.fromEffect(Effect.promise(() => document.fonts.ready)).pipe(
  Stream.as(undefined),
)

// Whether the reader has asked for less motion, read once.
export const prefersStill = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches
