import { Effect, Option, Queue, Stream } from 'effect'


export const LONGEST_STEP_S = 0.05

export const nextFrame = Effect.callback<number>(resume => {
  const id = requestAnimationFrame(now => resume(Effect.succeed(now)))
  return Effect.sync(() => cancelAnimationFrame(id))
})

export const frameTime: Effect.Effect<number> = Effect.sync(
  // oxlint-disable-next-line effect/noGlobals -- requestAnimationFrame stamps frames on performance.now's origin, and Clock is epoch-based
  () => performance.now(),
)

export const stepBetween = ({
  before,
  now,
  longest = LONGEST_STEP_S,
}: {
  readonly before: number
  readonly now: number
  readonly longest?: number
}): number => Math.min(Math.max((now - before) / 1000, 0), longest)

export const stepSince = ({ before, now }: { readonly before: Option.Option<number>; readonly now: number }): number =>
  Option.match(before, { onNone: () => 0, onSome: last => stepBetween({ before: last, now }) })

export const wakeToDraw = <E, R>(burst: Effect.Effect<void, E, R>) =>
  Effect.gen(function* () {
    const wakes = yield* Queue.sliding<true>(1)
    yield* Queue.take(wakes).pipe(Effect.andThen(burst), Effect.forever, Effect.forkScoped)
    const wake: Effect.Effect<void> = Queue.offer(wakes, true).pipe(Effect.asVoid)
    return { wake }
  })

export const wakeOn = <A, E, R>({
  stream,
  wake,
  handle = () => Effect.void,
}: {
  readonly stream: Stream.Stream<A, E, R>
  readonly wake: Effect.Effect<void>
  readonly handle?: (a: A) => Effect.Effect<void>
}) => Effect.forkScoped(Stream.runForEach(stream, a => Effect.andThen(handle(a), wake)))
