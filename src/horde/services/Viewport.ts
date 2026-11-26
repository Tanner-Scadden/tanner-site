import { Context, Effect, Layer, Queue, Stream } from 'effect'

// NOTE: what the horde needs from the browser: how wide the window is, so it
// can start just past the right edge, and a stream of frame deltas in
// milliseconds to walk by.
export class Viewport extends Context.Service<
  Viewport,
  {
    readonly width: Effect.Effect<number>
    readonly frames: Stream.Stream<number>
  }
>()('tanner-site/horde/services/Viewport') {
  static readonly browser = Layer.succeed(this, {
    width: Effect.sync(() => window.innerWidth),
    frames: Stream.callback<number>(queue =>
      Effect.acquireRelease(
        Effect.sync(() => {
          let last: number | undefined
          let id = 0
          const frame = (now: number) => {
            if (last !== undefined) Queue.offerUnsafe(queue, now - last)
            last = now
            id = requestAnimationFrame(frame)
          }
          id = requestAnimationFrame(frame)
          return () => cancelAnimationFrame(id)
        }),
        cancel => Effect.sync(cancel),
      ),
    ),
  })

  // A fixed width and no frames: a test sends the frames it wants.
  static readonly test = (width: number) =>
    Layer.succeed(this, { width: Effect.succeed(width), frames: Stream.never })
}
