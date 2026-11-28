import { Context, Effect, Layer, Option, Queue, Stream } from 'effect'

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
          let last: Option.Option<number> = Option.none()
          let id = 0
          const frame = (now: number) => {
            if (Option.isSome(last)) Queue.offerUnsafe(queue, now - last.value)
            last = Option.some(now)
            id = requestAnimationFrame(frame)
          }
          id = requestAnimationFrame(frame)
          return () => cancelAnimationFrame(id)
        }),
        cancel => Effect.sync(cancel),
      ),
    ),
  })

  static readonly test = (width: number) =>
    Layer.succeed(this, { width: Effect.succeed(width), frames: Stream.never })
}
