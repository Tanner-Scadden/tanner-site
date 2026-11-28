import { Effect, Latch, Option, Ref, Schema, Stream, String as Str } from 'effect'

import { fitCanvas } from '../../gpu/canvas.ts'
import { nextFrame, stepBetween, wakeOn } from '../../gpu/loop.ts'
import { prefersStill, resizes, visibility } from '../../gpu/observe.ts'
import { type Clock, follow, interact, opacityAt, startClock, tick } from './clock.ts'
import { type Controls, type Report, SLIDER_STEPS } from './controls.ts'
import { clamp01 } from './kit.ts'
import type { Point, Scene } from './scene.ts'
import { painterFor } from './webgpu/painters.ts'

// Seconds as m:ss.
const clockOf = (seconds: number): string => {
  const whole = Math.max(0, Math.floor(seconds))
  return `${Math.floor(whole / 60)}:${Str.padStart(2, '0')(String(whole % 60))}`
}

// A latch that's open while the canvas is on screen. The observer starts
// watching straight away, before the loop first waits on it.
const onScreen = (canvas: HTMLCanvasElement) =>
  Effect.gen(function* () {
    const latch = yield* Latch.make(false)
    yield* Stream.runForEach(visibility(canvas), seen => (seen ? Latch.open(latch) : Latch.close(latch))).pipe(
      Effect.forkScoped({ startImmediately: true }),
    )
    return latch
  })

// Clicking the drawing interacts, aimed where it was clicked, and tells the
// figure so it plays on. A click on a full run changes nothing.
const aimOnClick = (
  scene: Scene,
  canvas: HTMLCanvasElement,
  clock: Ref.Ref<Clock>,
  wake: Latch.Latch,
  report: (report: Report) => Effect.Effect<unknown>,
) =>
  Stream.fromEventListener<MouseEvent>(canvas, 'click').pipe(
    Stream.runForEach(event =>
      Effect.gen(function* () {
        const rect = canvas.getBoundingClientRect()
        const aim: Point = [
          clamp01(event.offsetX / Math.max(1, rect.width)),
          clamp01(event.offsetY / Math.max(1, rect.height)),
        ]
        const grew = yield* Ref.modify(clock, now => {
          const next = interact(scene, now, Option.some(aim))
          return [next.interactions.length > now.interactions.length, next]
        })
        if (!grew) return
        yield* Latch.open(wake)
        yield* report({ _tag: 'Aimed' })
      }),
    ),
    Effect.forkScoped,
  )

// Where a pointer event is over the canvas, in CSS px.
const overCanvas =
  (canvas: HTMLCanvasElement) =>
  (event: PointerEvent): Point => {
    const rect = canvas.getBoundingClientRect()
    return [event.clientX - rect.left, event.clientY - rect.top]
  }

// The browser had already let go of the pointer, so the canvas can't hold
// on to it.
class PointerGone extends Schema.TaggedError<PointerGone, { readonly brand: unique symbol }>()('PointerGone', {
  cause: Schema.Unknown,
}) {}

// How far, in CSS px, a press has to travel before it's a drag, not a click.
const DRAG = 8

// In a scene that takes drags: a press on the drawing, held, then let go.
// While it's held, `held` says where it went down. Letting go further away
// is a drag to there; letting go close by changes nothing.
const dragOnPointer = (
  scene: Scene,
  canvas: HTMLCanvasElement,
  clock: Ref.Ref<Clock>,
  held: Ref.Ref<Option.Option<Point>>,
  wake: Latch.Latch,
  report: (report: Report) => Effect.Effect<unknown>,
) => {
  const aimOf = ([x, y]: Point): Point => {
    const rect = canvas.getBoundingClientRect()
    return [clamp01(x / Math.max(1, rect.width)), clamp01(y / Math.max(1, rect.height))]
  }
  const at = overCanvas(canvas)
  const pressed = Stream.fromEventListener<PointerEvent>(canvas, 'pointerdown').pipe(
    Stream.runForEach(event =>
      // Keep the drag even when it leaves the canvas. A pointer the browser
      // has already let go of can't be captured, and that's fine.
      Effect.try({ try: () => canvas.setPointerCapture(event.pointerId), catch: cause => PointerGone.make({ cause }) }).pipe(
        Effect.ignore,
        Effect.andThen(Ref.set(held, Option.some(at(event)))),
        Effect.andThen(Latch.open(wake)),
      ),
    ),
  )
  const released = Stream.fromEventListener<PointerEvent>(canvas, 'pointerup').pipe(
    Stream.runForEach(event =>
      Effect.gen(function* () {
        const from = yield* Ref.getAndSet(held, Option.none())
        if (Option.isNone(from)) return
        const up = at(event)
        const moved = Math.hypot(up[0] - from.value[0], up[1] - from.value[1]) > DRAG
        const grew = yield* Ref.modify(clock, now => {
          const next = moved ? interact(scene, now, Option.some(aimOf(from.value)), aimOf(up)) : now
          return [next.interactions.length > now.interactions.length, next]
        })
        yield* Latch.open(wake)
        if (grew) yield* report({ _tag: 'Aimed' })
      }),
    ),
  )
  // The browser took the press, say to scroll: it lets go of nothing.
  const cancelled = Stream.fromEventListener(canvas, 'pointercancel').pipe(
    Stream.runForEach(() => Ref.set(held, Option.none()).pipe(Effect.andThen(Latch.open(wake)))),
  )
  return Effect.all([pressed, released, cancelled], { concurrency: 'unbounded', discard: true }).pipe(
    Effect.forkScoped,
  )
}

// Where the reader's pointer is over the canvas, in CSS px.
const followPointer = (canvas: HTMLCanvasElement, pointer: Ref.Ref<Option.Option<Point>>, wake: Latch.Latch) =>
  Stream.merge(
    Stream.fromEventListener<PointerEvent>(canvas, 'pointermove', { passive: true }).pipe(
      Stream.map((event): Option.Option<Point> => Option.some(overCanvas(canvas)(event))),
    ),
    Stream.fromEventListener(canvas, 'pointerleave').pipe(Stream.as(Option.none<Point>())),
  ).pipe(
    Stream.runForEach(at => Ref.set(pointer, at).pipe(Effect.andThen(Latch.open(wake)))),
    Effect.forkScoped,
  )

export const playScene = (
  canvas: HTMLCanvasElement,
  scene: Scene,
  controls: Controls,
  changes: Stream.Stream<Controls>,
  report: (report: Report) => Effect.Effect<unknown>,
) =>
  Effect.gen(function* () {
    const still = prefersStill()
    const painter = yield* painterFor(canvas, scene.maxLines, scene.maxDots)
    yield* report({ _tag: 'Started', drawable: true, still })

    const figure = canvas.closest('figure')
    const slider = Option.fromNullishOr(figure?.querySelector<HTMLInputElement>('input[type="range"]'))
    const readout = Option.fromNullishOr(figure?.querySelector<HTMLElement>('[data-clock]'))
    const clock = yield* Ref.make(startClock(scene, controls, still))
    const pointer = yield* Ref.make(Option.none<Point>())
    const held = yield* Ref.make(Option.none<Point>())

    const draw = (now: Clock, at: Option.Option<Point>, holding: Option.Option<Point>) => {
      const size = fitCanvas(canvas, { measure: 'rect' })
      const shapes = now.run.shapesAt(now.time, size.width, size.height, at, now.interactions, holding)
      painter.paint(shapes, size.width, size.height, opacityAt(scene, now))
      Option.map(slider, input => {
        // Not while the reader is holding it, or it'd fight their drag.
        const step = String(Math.round(clamp01(now.time / now.run.end) * SLIDER_STEPS))
        if (input.value !== step && !input.matches(':active')) input.value = step
      })
      Option.map(readout, element => {
        const text = `${clockOf(Math.min(now.time, now.run.end))} / ${clockOf(now.run.end)}`
        if (element.textContent !== text) element.textContent = text
      })
    }

    // Anything that changes what's on the canvas wakes a paused drawing.
    const wake = yield* Latch.make(true)
    yield* wakeOn({ stream: resizes([canvas]), wake: Effect.asVoid(Latch.open(wake)) })
    yield* followPointer(canvas, pointer, wake)
    if (scene.interact !== undefined) {
      if (scene.drag === true) yield* dragOnPointer(scene, canvas, clock, held, wake, report)
      else yield* aimOnClick(scene, canvas, clock, wake, report)
    }
    yield* Stream.runForEach(changes, next =>
      Ref.update(clock, now => follow(scene, now, next)).pipe(Effect.andThen(Latch.open(wake))),
    ).pipe(Effect.forkScoped)

    const visible = yield* onScreen(canvas)
    let last = yield* nextFrame
    let counted = 0
    while (true) {
      yield* visible.await
      yield* Latch.close(wake)
      const frame = yield* nextFrame
      // Seconds since the last frame, capped so a hidden tab doesn't jump.
      // Scenes are timed to a looser cap than the core's.
      const seconds = stepBetween({ before: last, now: frame, longest: 0.1 })
      last = frame
      const [ended, now] = yield* Ref.modify(clock, c => {
        const next = c.playing ? tick(scene, c, seconds) : c
        return [[c.playing && !next.playing, next] as const, next]
      })
      const at = yield* Ref.get(pointer)
      const holding = yield* Ref.get(held)
      draw(now, at, holding)
      if (now.interactions.length !== counted) {
        counted = now.interactions.length
        yield* report({ _tag: 'Counted', interactions: counted })
      }
      // A scene that plays once has stopped on its last frame.
      if (ended) yield* report({ _tag: 'Ended' })
      if (!now.playing) yield* wake.await
    }
  })
