// NOTE: plays a scene on a canvas, as one scoped Effect.
//
// The figure's controls arrive as a stream: which variant, whether it's
// playing, and where the slider last put it. This side owns the clock, so it
// moves the slider itself as the run plays, and playing never re-renders the
// page. A finished run holds, fades, and the next seed starts.
//
// Three tiers: WebGPU, a 2D canvas without it, and still for readers who
// prefer reduced motion, which starts paused on the finished frame and only
// moves when they press play or drag the slider. It only animates while the
// canvas is on screen, and while paused it waits for the next change (the
// controls, the reader's pointer, a resize) instead of drawing every frame.

import { Effect, Latch, Number as Num, Option, Ref, Stream, String as Str } from 'effect'

import { nextFrame } from '../../blueprint/webgpu/renderer.ts'
import { type Controls, FADE, HOLD, SLIDER_STEPS, type Started } from './controls.ts'
import type { Point, Run, Scene } from './scene.ts'
import { painterFor } from './webgpu/painters.ts'

const MAX_PIXEL_RATIO = 2

interface Clock {
  readonly seed: number
  readonly variant: string
  readonly run: Run
  readonly time: number
  readonly playing: boolean
  readonly seeks: number
}

const clamp01 = (t: number): number => Num.clamp(t, { minimum: 0, maximum: 1 })

// The clock after the controls change. A new variant starts over, unless
// it's paused, where it keeps its place.
const follow = (scene: Scene, clock: Clock, controls: Controls): Clock => {
  const changed = controls.variant !== clock.variant
  const run = changed ? scene.run(controls.variant, clock.seed) : clock.run
  const kept = !changed ? clock.time : controls.playing ? 0 : clamp01(clock.time / clock.run.end) * run.end
  const time = controls.seeks !== clock.seeks ? controls.seek * run.end : kept
  return { ...clock, variant: controls.variant, run, time, playing: controls.playing, seeks: controls.seeks }
}

const tick = (scene: Scene, clock: Clock, seconds: number): Clock => {
  const time = clock.time + seconds
  if (time <= clock.run.end + HOLD + FADE) return { ...clock, time }
  const seed = clock.seed + 1
  return { ...clock, seed, run: scene.run(clock.variant, seed), time: 0 }
}

const opacityAt = ({ run, time }: Clock): number => 1 - clamp01((time - run.end - HOLD) / FADE)

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
  started: (report: Started) => Effect.Effect<unknown>,
) =>
  Effect.gen(function* () {
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const painter = yield* painterFor(canvas, scene.maxLines, scene.maxDots)
    yield* started({ renderer: painter.renderer, still })

    const figure = canvas.closest('figure')
    const slider = Option.fromNullishOr(figure?.querySelector<HTMLInputElement>('input[type="range"]'))
    const readout = Option.fromNullishOr(figure?.querySelector<HTMLElement>('[data-clock]'))
    const run = scene.run(controls.variant, 1)
    const clock = yield* Ref.make<Clock>({
      seed: 1,
      variant: controls.variant,
      run,
      time: still ? run.end : 0,
      playing: controls.playing && !still,
      seeks: controls.seeks,
    })
    const pointer = yield* Ref.make(Option.none<Point>())

    const draw = (now: Clock, at: Option.Option<Point>) => {
      const size = fit(canvas)
      const shapes = now.run.shapesAt(now.time, size.width, size.height, at)
      painter.paint(shapes, size.width, size.height, opacityAt(now))
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
    yield* Stream.runForEach(changes, next =>
      Ref.update(clock, now => follow(scene, now, next)).pipe(Effect.andThen(Latch.open(wake))),
    ).pipe(Effect.forkScoped)

    const visible = yield* onScreen(canvas)
    let last = yield* nextFrame
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
      if (!now.playing) yield* wake.await
    }
  })
