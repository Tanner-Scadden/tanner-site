// NOTE: the Selected Work drawing, as one scoped Effect like the blueprint.
// The canvas sits behind the job list and owns the PROBLEM, APPROACH and
// RESULT outlines while it runs (the CSS borders step aside). The page's
// layout is read from the DOM, the timing rules live in ./work, and the loop
// sleeps whenever nothing is drawing, so a resting list costs nothing.

import { Data, Effect, Queue, Ref, type Scope, Stream } from 'effect'

import {
  type GpuUnavailable,
  acquireBuffer,
  acquireContext,
  acquireDevice,
  nextFrame,
  requestAdapter,
} from '../../blueprint/webgpu/renderer.ts'
import {
  type Hovered,
  STEPS,
  type WorkState,
  replayed,
  initialWork,
  pingOf,
  revealOf,
  seen,
  settled,
  sparkOf,
  step,
  wake,
} from './work.ts'
import { BOXES, BOX_FLOATS, SPARKS, SPARK_FLOATS } from './shaders.ts'

export interface WorkSettings {
  readonly still: boolean
}

const VIEW_FLOATS = 4
const MAX_PIXEL_RATIO = 2
const GAPS = STEPS - 1

interface Rect {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
}

interface Segment {
  readonly from: readonly [number, number]
  readonly to: readonly [number, number]
}

// Where every box and arrow sits, in CSS px from the canvas's corner.
interface Layout {
  readonly boxes: ReadonlyArray<ReadonlyArray<Rect>>
  readonly gaps: ReadonlyArray<ReadonlyArray<Segment>>
}

// The arrow between two boxes runs across the gap between them: sideways
// when they sit in a row, downward when the list stacks on a phone.
const gapBetween = (a: Rect, b: Rect): Segment =>
  b.x >= a.x + a.w - 1
    ? {
        from: [a.x + a.w, a.y + a.h / 2],
        to: [b.x, b.y + b.h / 2],
      }
    : {
        from: [a.x + a.w / 2, a.y + a.h],
        to: [b.x + b.w / 2, b.y],
      }

const measure = (
  canvas: HTMLCanvasElement,
  jobs: ReadonlyArray<HTMLElement>,
): Layout => {
  const origin = canvas.getBoundingClientRect()
  const boxes = jobs.map(job =>
    Array.from(job.querySelectorAll('.step'), el => {
      const r = el.getBoundingClientRect()
      return { x: r.left - origin.left, y: r.top - origin.top, w: r.width, h: r.height }
    }).slice(0, STEPS),
  )
  const gaps = boxes.map(row =>
    row.slice(1).map((box, i) => gapBetween(row[i]!, box)),
  )
  return { boxes, gaps }
}

const BLEND: GPUBlendState = {
  color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
  alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
}

const makeGpu = (canvas: HTMLCanvasElement, jobs: number) =>
  Effect.gen(function* () {
    const adapter = yield* requestAdapter
    const device = yield* acquireDevice(adapter)
    const { context, format } = yield* acquireContext(canvas, device, 'premultiplied')

    const boxCount = jobs * STEPS
    const sparkCount = jobs * GAPS
    const viewBuffer = yield* acquireBuffer(device, {
      size: VIEW_FLOATS * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    })
    const boxBuffer = yield* acquireBuffer(device, {
      size: Math.max(1, boxCount) * BOX_FLOATS * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    })
    const sparkBuffer = yield* acquireBuffer(device, {
      size: Math.max(1, sparkCount) * SPARK_FLOATS * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    })

    const pipeline = (code: string) => {
      const module = device.createShaderModule({ code })
      return device.createRenderPipeline({
        layout: 'auto',
        vertex: { module, entryPoint: 'vs' },
        fragment: { module, entryPoint: 'fs', targets: [{ format, blend: BLEND }] },
        primitive: { topology: 'triangle-list' },
      })
    }
    const bind = (pipeline: GPURenderPipeline, buffers: ReadonlyArray<GPUBuffer>) =>
      device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: buffers.map((buffer, binding) => ({ binding, resource: { buffer } })),
      })
    const boxes = pipeline(BOXES)
    const sparks = pipeline(SPARKS)

    return {
      device,
      context,
      viewBuffer,
      viewData: new Float32Array(VIEW_FLOATS),
      boxBuffer,
      boxData: new Float32Array(Math.max(1, boxCount) * BOX_FLOATS),
      boxCount,
      sparkBuffer,
      sparkData: new Float32Array(Math.max(1, sparkCount) * SPARK_FLOATS),
      sparkCount,
      boxes: { pipeline: boxes, group: bind(boxes, [viewBuffer, boxBuffer]) },
      sparks: { pipeline: sparks, group: bind(sparks, [viewBuffer, sparkBuffer]) },
    }
  })

type Gpu = Effect.Success<ReturnType<typeof makeGpu>>

// The backing store follows the CSS size, at a pixel ratio the GPU can hold
// even for a long list on a phone.
const fitCanvas = (canvas: HTMLCanvasElement, maxSize: number): number => {
  const width = Math.max(1, canvas.clientWidth)
  const height = Math.max(1, canvas.clientHeight)
  const dpr = Math.min(
    window.devicePixelRatio || 1,
    MAX_PIXEL_RATIO,
    maxSize / width,
    maxSize / height,
  )
  const w = Math.max(1, Math.floor(width * dpr))
  const h = Math.max(1, Math.floor(height * dpr))
  if (canvas.width !== w) canvas.width = w
  if (canvas.height !== h) canvas.height = h
  return w / width
}

const render = (
  gpu: Gpu,
  canvas: HTMLCanvasElement,
  layout: Layout,
  state: WorkState,
  now: number,
  still: boolean,
) =>
  Effect.sync(() => {
    const dpr = fitCanvas(canvas, gpu.device.limits.maxTextureDimension2D)
    gpu.viewData.set([canvas.clientWidth, canvas.clientHeight, dpr, 0])
    gpu.device.queue.writeBuffer(gpu.viewBuffer, 0, gpu.viewData)

    gpu.boxData.fill(0)
    gpu.sparkData.fill(0)
    state.jobs.forEach((job, j) => {
      for (let b = 0; b < STEPS; b++) {
        const rect = layout.boxes[j]?.[b]
        if (rect === undefined) continue
        // NOTE: the order matches `struct Box` in the shader.
        gpu.boxData.set(
          [
            rect.x,
            rect.y,
            rect.w,
            rect.h,
            revealOf(job, { box: b, now, still }),
            job.hover[b] ?? 0,
            b === STEPS - 1 ? 1 : 0,
            pingOf(job, { box: b, now, still }),
          ],
          (j * STEPS + b) * BOX_FLOATS,
        )
      }
      for (let g = 0; g < GAPS; g++) {
        const gap = layout.gaps[j]?.[g]
        const t = sparkOf(job, { box: g + 1, now, still })
        gpu.sparkData.set(
          gap === undefined
            ? [0, 0, 0, 0, -1, 0, 0, 0]
            : [...gap.from, ...gap.to, t ?? -1, 0, 0, 0],
          (j * GAPS + g) * SPARK_FLOATS,
        )
      }
    })
    gpu.device.queue.writeBuffer(gpu.boxBuffer, 0, gpu.boxData)
    gpu.device.queue.writeBuffer(gpu.sparkBuffer, 0, gpu.sparkData)

    const encoder = gpu.device.createCommandEncoder()
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: gpu.context.getCurrentTexture().createView(),
          loadOp: 'clear',
          storeOp: 'store',
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
        },
      ],
    })
    if (gpu.boxCount > 0) {
      pass.setPipeline(gpu.boxes.pipeline)
      pass.setBindGroup(0, gpu.boxes.group)
      pass.draw(6, gpu.boxCount)
    }
    if (gpu.sparkCount > 0) {
      pass.setPipeline(gpu.sparks.pipeline)
      pass.setBindGroup(0, gpu.sparks.group)
      pass.draw(6, gpu.sparkCount)
    }
    pass.end()
    gpu.device.queue.submit([encoder.finish()])
  })

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

type Input = Data.TaggedEnum<{
  // A job came into view for the first time.
  Seen: { readonly job: number }
  // A mouse is over a box (or between boxes), or left the list.
  Pointed: { readonly hovered: Hovered | null }
  // A finger or button went down on a job.
  Tapped: { readonly job: number }
  // The list's layout changed, so every box is measured again.
  Moved: {}
}>
const Input = Data.taggedEnum<Input>()

const seenJobs = (jobs: ReadonlyArray<HTMLElement>): Stream.Stream<Input> =>
  Stream.callback<Input>(queue =>
    Effect.acquireRelease(
      Effect.sync(() => {
        const observer = new IntersectionObserver(
          entries => {
            for (const entry of entries) {
              if (!entry.isIntersecting) continue
              const job = jobs.indexOf(entry.target as HTMLElement)
              if (job < 0) continue
              observer.unobserve(entry.target)
              Queue.offerUnsafe(queue, Input.Seen({ job }))
            }
          },
          // A job draws once a good part of it is on screen.
          { rootMargin: '0px 0px -12% 0px', threshold: 0.2 },
        )
        for (const job of jobs) observer.observe(job)
        return observer
      }),
      observer => Effect.sync(() => observer.disconnect()),
    ),
  )

const resized = (elements: ReadonlyArray<Element>): Stream.Stream<Input> =>
  Stream.callback<Input>(queue =>
    Effect.acquireRelease(
      Effect.sync(() => {
        const observer = new ResizeObserver(() => Queue.offerUnsafe(queue, Input.Moved()))
        for (const el of elements) observer.observe(el)
        return observer
      }),
      observer => Effect.sync(() => observer.disconnect()),
    ),
  )

const hoveredAt = (
  jobs: ReadonlyArray<HTMLElement>,
  target: EventTarget | null,
): Hovered | null => {
  if (!(target instanceof Element)) return null
  const jobEl = target.closest<HTMLElement>('.job')
  const job = jobEl === null ? -1 : jobs.indexOf(jobEl)
  if (job < 0) return null
  const stepEl = target.closest('.step')
  const steps = Array.from(jobs[job]!.querySelectorAll('.step'))
  const index = stepEl === null ? -1 : steps.indexOf(stepEl)
  return { job, step: index < 0 ? null : index }
}

const pointed = (
  container: HTMLElement,
  jobs: ReadonlyArray<HTMLElement>,
): Stream.Stream<Input> =>
  Stream.merge(
    Stream.fromEventListener<PointerEvent>(container, 'pointerover', { passive: true }).pipe(
      Stream.filter(event => event.pointerType === 'mouse'),
      Stream.map(event => Input.Pointed({ hovered: hoveredAt(jobs, event.target) })),
    ),
    Stream.fromEventListener(container, 'pointerleave').pipe(
      Stream.as(Input.Pointed({ hovered: null })),
    ),
  )

// A tap or click on a job plays its spark again.
const taps = (
  container: HTMLElement,
  jobs: ReadonlyArray<HTMLElement>,
): Stream.Stream<Input> =>
  Stream.fromEventListener<PointerEvent>(container, 'pointerdown', { passive: true }).pipe(
    Stream.filter(event => event.isPrimary),
    Stream.map(event => hoveredAt(jobs, event.target)),
    Stream.filter(at => at !== null),
    Stream.map(({ job }) => Input.Tapped({ job })),
  )

// ---------------------------------------------------------------------------
// The drawing
// ---------------------------------------------------------------------------

// Marks the list while the GPU draws it, so the CSS borders step aside and
// the text waits for its box. Closing the scope hands both back to CSS.
const markList = (container: HTMLElement, jobs: ReadonlyArray<HTMLElement>) =>
  Effect.acquireRelease(
    Effect.sync(() => {
      container.dataset['gpu'] = 'on'
    }),
    () =>
      Effect.sync(() => {
        delete container.dataset['gpu']
        for (const job of jobs) delete job.dataset['drawn']
      }),
  )

// Starts the drawing on `canvas`, which sits inside the job list, and
// returns once it's running. It follows `changes` and the list for as long
// as `Scope` stays open, and fails with GpuUnavailable when this browser
// can't run it.
export const runWorkDrawing = (
  canvas: HTMLCanvasElement,
  initial: WorkSettings,
  changes: Stream.Stream<WorkSettings>,
): Effect.Effect<void, GpuUnavailable, Scope.Scope> =>
  Effect.gen(function* () {
    const container = canvas.parentElement
    if (container === null) return
    const jobs = Array.from(container.querySelectorAll<HTMLElement>('.job'))
    const gpu = yield* makeGpu(canvas, jobs.length)

    const settings = yield* Ref.make(initial)
    const hovered = yield* Ref.make<Hovered | null>(null)
    const state = yield* Ref.make(initialWork(jobs.length))
    const layout = yield* Ref.make(measure(canvas, jobs))
    const wakes = yield* Queue.sliding<void>(1)
    const poke = Queue.offer(wakes, undefined)

    // Draws frames until nothing moves, then returns.
    const animate = Effect.gen(function* () {
      yield* Ref.update(state, wake)
      while (true) {
        const now = yield* nextFrame
        const { still } = yield* Ref.get(settings)
        const tick = { now, hovered: yield* Ref.get(hovered), still }
        const next = yield* Ref.updateAndGet(state, before => step(before, tick))
        const boxes = yield* Ref.get(layout)
        yield* render(gpu, canvas, boxes, next, now, still)
        if (settled(next, tick)) return
      }
    })

    const handle = Input.$match({
      Seen: ({ job }) =>
        Effect.andThen(
          Effect.sync(() => {
            jobs[job]!.dataset['drawn'] = ''
          }),
          Ref.update(state, s => seen(s, { job, now: performance.now() })),
        ),
      Pointed: ({ hovered: next }) =>
        Effect.gen(function* () {
          const before = yield* Ref.getAndSet(hovered, next)
          if (next !== null && next.job !== before?.job) {
            yield* Ref.update(state, s => replayed(s, { job: next.job, now: performance.now() }))
          }
        }),
      Tapped: ({ job }) =>
        Ref.update(state, s => replayed(s, { job, now: performance.now() })),
      Moved: () => Ref.set(layout, measure(canvas, jobs)),
    })

    const inputs = Stream.mergeAll(
      [
        seenJobs(jobs),
        pointed(container, jobs),
        taps(container, jobs),
        resized([container, ...container.querySelectorAll('.step')]),
        Stream.fromEventListener(window, 'resize').pipe(Stream.as(Input.Moved())),
        // Web fonts landing can reflow every box.
        Stream.fromEffect(
          Effect.promise(() => document.fonts.ready).pipe(Effect.as(Input.Moved())),
        ),
      ],
      { concurrency: 'unbounded' },
    )

    yield* Effect.forkScoped(Effect.forever(Effect.andThen(Queue.take(wakes), animate)))
    yield* Effect.forkScoped(
      Stream.runForEach(inputs, input => Effect.andThen(handle(input), poke)),
    )
    yield* Effect.forkScoped(
      Stream.runForEach(changes, next => Effect.andThen(Ref.set(settings, next), poke)),
    )

    // A lost device hands the outlines back to CSS, so the list still reads.
    yield* Effect.forkScoped(
      Effect.andThen(
        Effect.promise(() => gpu.device.lost),
        Effect.sync(() => {
          container.dataset['gpu'] = 'lost'
        }),
      ),
    )

    yield* markList(container, jobs)
    yield* poke
  })
