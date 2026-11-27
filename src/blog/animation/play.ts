import { Effect, Latch, Option, Ref, Stream, String as Str } from 'effect'

import { nextFrame } from '../../blueprint/webgpu/renderer.ts'
import { type Clock, follow, interact, opacityAt, startClock, tick } from './clock.ts'
import { type Controls, type Report, SLIDER_STEPS } from './controls.ts'
import { clamp01 } from './kit.ts'
import type { Point, Scene } from './scene.ts'
import { painterFor } from './webgpu/painters.ts'

const MAX_PIXEL_RATIO = 2

// Seconds as m:ss.
const clockOf = (seconds: number): string => {
  const whole = Math.max(0, Math.floor(seconds))
  return `${Math.floor(whole / 60)}:${Str.padStart(2, '0')(String(whole % 60))}`
}

// The canvas's CSS size, with its backing store matched to the screen.
const fit = (canvas: HTMLCanvasElement) => {
  const rect = canvas.getBoundingClientRect()
  const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO)
  const width = Math.max(1, Math.round(rect.width * ratio))
  const height = Math.max(1, Math.round(rect.height * ratio))
  if (canvas.width !== width) canvas.width = width
  if (canvas.height !== height) canvas.height = height
  return { width: rect.width, height: rect.height }
}

// A latch that's open while the canvas is on screen.
const onScreen = (canvas: HTMLCanvasElement) =>
  Effect.gen(function* () {
    const latch = yield* Latch.make(false)
    yield* Effect.acquireRelease(
      Effect.sync(() => {
        const observer = new IntersectionObserver(entries => {
          for (const entry of entries) {
            if (entry.isIntersecting) Latch.openUnsafe(latch)
            else Latch.closeUnsafe(latch)
          }
        })
        observer.observe(canvas)
        return observer
      }),
      observer => Effect.sync(() => observer.disconnect()),
    )
    return latch
  })

// Opens `wake` every time the canvas changes size.
const wakeOnResize = (canvas: HTMLCanvasElement, wake: Latch.Latch) =>
  Effect.acquireRelease(
    Effect.sync(() => {
      const observer = new ResizeObserver(() => Latch.openUnsafe(wake))
      observer.observe(canvas)
      return observer
    }),
    observer => Effect.sync(() => observer.disconnect()),
  )

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

// Where the reader's pointer is over the canvas, in CSS px.
const followPointer = (canvas: HTMLCanvasElement, pointer: Ref.Ref<Option.Option<Point>>, wake: Latch.Latch) =>
  Stream.merge(
    Stream.fromEventListener<PointerEvent>(canvas, 'pointermove', { passive: true }).pipe(
      Stream.map((event): Option.Option<Point> => Option.some([event.offsetX, event.offsetY])),
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
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const painter = yield* painterFor(canvas, scene.maxLines, scene.maxDots)
    yield* report({ _tag: 'Started', drawable: true, still })

    const figure = canvas.closest('figure')
    const slider = Option.fromNullishOr(figure?.querySelector<HTMLInputElement>('input[type="range"]'))
    const readout = Option.fromNullishOr(figure?.querySelector<HTMLElement>('[data-clock]'))
    const clock = yield* Ref.make(startClock(scene, controls, still))
    const pointer = yield* Ref.make(Option.none<Point>())

    const draw = (now: Clock, at: Option.Option<Point>) => {
      const size = fit(canvas)
      const shapes = now.run.shapesAt(now.time, size.width, size.height, at, now.interactions)
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
    yield* wakeOnResize(canvas, wake)
    yield* followPointer(canvas, pointer, wake)
    if (scene.interact !== undefined) yield* aimOnClick(scene, canvas, clock, wake, report)
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
      const seconds = Math.min(Math.max((frame - last) / 1000, 0), 0.1)
      last = frame
      const now = yield* Ref.updateAndGet(clock, c => (c.playing ? tick(scene, c, seconds) : c))
      const at = yield* Ref.get(pointer)
      draw(now, at)
      if (now.interactions.length !== counted) {
        counted = now.interactions.length
        yield* report({ _tag: 'Counted', interactions: counted })
      }
      if (!now.playing) yield* wake.await
    }
  })
