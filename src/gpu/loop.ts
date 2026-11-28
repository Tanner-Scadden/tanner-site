import { Effect, Queue, Stream } from 'effect'

// Frames, and drawing only while something moves, for every drawing on the
// site.

// The longest step a frame takes, in seconds, so a tab that was hidden or a
// frame that stalled doesn't jump the drawing ahead.
export const LONGEST_STEP_S = 0.05

// The next animation frame's time, cancelled if the fiber is interrupted.
export const nextFrame = Effect.callback<number>(resume => {
  const id = requestAnimationFrame(now => resume(Effect.succeed(now)))
  return Effect.sync(() => cancelAnimationFrame(id))
})

// Seconds between two frames' times, capped at `longest`. The first frame
// of a burst, with no frame before it, steps 0.
export const stepBetween = ({
  before,
  now,
  longest = LONGEST_STEP_S,
}: {
  readonly before: number | null
  readonly now: number
  readonly longest?: number
}): number => (before === null ? 0 : Math.min(Math.max((now - before) / 1000, 0), longest))

// Runs `burst` each time the drawing is woken, one burst at a time. A burst
// draws frames until nothing moves, then returns, and the drawing sleeps
// until the next wake. Wakes that come in during a burst fold into one, so
// the drawing never falls behind.
//
// Gives back `wake`, for anything that changes what's on screen.
export const wakeToDraw = <E, R>(burst: Effect.Effect<void, E, R>) =>
  Effect.gen(function* () {
    const wakes = yield* Queue.sliding<void>(1)
    yield* Effect.forkScoped(Effect.forever(Effect.andThen(Queue.take(wakes), burst)))
    const wake: Effect.Effect<void> = Queue.offer(wakes, undefined).pipe(Effect.asVoid)
    return { wake }
  })

// Wakes the drawing on every element in `stream`, after `handle` has taken
// it in, for as long as the scope stays open.
export const wakeOn = <A, E, R>({
  stream,
  wake,
  handle = () => Effect.void,
}: {
  readonly stream: Stream.Stream<A, E, R>
  readonly wake: Effect.Effect<void>
  readonly handle?: (a: A) => Effect.Effect<void>
}) => Effect.forkScoped(Stream.runForEach(stream, a => Effect.andThen(handle(a), wake)))
