import { Array as Arr, Data, Effect, Filter, Option, Queue, Ref, type Scope, Stream } from 'effect'

import { fitCanvas } from '../../gpu/canvas.ts'
import { type GpuUnavailable, acquireBuffer, acquireGpu, markDrawing } from '../../gpu/device.ts'
import { frameTime, nextFrame, wakeOn, wakeToDraw } from '../../gpu/loop.ts'
import { fontsReady, resizes } from '../../gpu/observe.ts'
import { GOLD as GOLD_RGB, type Rgb, float } from '../../gpu/palette.ts'
import { bound, renderPipeline, whole } from '../../gpu/pipeline.ts'
import {
  type Hovered,
  type JobState,
  STEPS,
  type WorkState,
  replayed,
  initialWork,
  pingOf,
  seen,
  settled,
  step,
  wake,
  waveOf,
  WAVE_TAIL,
} from './work.ts'
import { BOXES, BOX_FLOATS, GAPS as GAP_SHADER, GAP_FLOATS } from './shaders.ts'

export interface WorkSettings {
  readonly still: boolean
}

const VIEW_FLOATS = 4
const GAPS = STEPS - 1
const WAVE_PX = 120
const GOLD = float(GOLD_RGB)

const parseHex = (hex: string): Option.Option<Rgb> => {
  const found = Option.fromNullishOr(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim()))
  return Option.map(found, match => [
    parseInt(match[1]!, 16) / 255,
    parseInt(match[2]!, 16) / 255,
    parseInt(match[3]!, 16) / 255,
  ])
}

const waveColor = (job: HTMLElement): Rgb =>
  Option.fromNullishOr(job.dataset['wave']).pipe(
    Option.flatMap(parseHex),
    Option.getOrElse(() => GOLD),
  )

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

interface Row {
  readonly boxes: ReadonlyArray<Rect>
  readonly gaps: ReadonlyArray<Segment>
  readonly stacked: boolean
  readonly boxStarts: ReadonlyArray<number>
  readonly gapStarts: ReadonlyArray<number>
  readonly length: number
  readonly color: Rgb
}

type Layout = ReadonlyArray<Row>

const gapBetween = (a: Rect, b: Rect): Segment => {
  if (b.x >= a.x + a.w - 1) {
    return {
      from: [a.x + a.w, a.y + a.h / 2],
      to: [b.x, b.y + b.h / 2],
    }
  }
  return {
    from: [a.x + a.w / 2, a.y + a.h],
    to: [b.x + b.w / 2, b.y],
  }
}

const rowOf = (boxes: ReadonlyArray<Rect>, color: Rgb): Row => {
  const gaps = boxes.slice(1).map((box, i) => gapBetween(boxes[i]!, box))
  const stacked = boxes.length > 1 && boxes[1]!.x < boxes[0]!.x + boxes[0]!.w - 1
  const boxStarts: Array<number> = []
  const gapStarts: Array<number> = []
  let at = 0
  boxes.forEach((box, i) => {
    boxStarts.push(at)
    at += box.w + box.h
    const gap = Arr.get(gaps, i)
    if (Option.isNone(gap)) return
    gapStarts.push(at)
    at += Math.hypot(gap.value.to[0] - gap.value.from[0], gap.value.to[1] - gap.value.from[1])
  })
  return { boxes, gaps, stacked, boxStarts, gapStarts, length: at, color }
}

const measure = (
  canvas: HTMLCanvasElement,
  jobs: ReadonlyArray<HTMLElement>,
): Layout => {
  const origin = canvas.getBoundingClientRect()
  return jobs.map(job =>
    rowOf(
      Array.from(job.querySelectorAll('[data-step]'), el => {
        const r = el.getBoundingClientRect()
        return { x: r.left - origin.left, y: r.top - origin.top, w: r.width, h: r.height }
      }).slice(0, STEPS),
      waveColor(job),
    ),
  )
}

const makeGpu = (canvas: HTMLCanvasElement, jobs: number) =>
  Effect.gen(function* () {
    const { device, context, format } = yield* acquireGpu(canvas, 'premultiplied')

    const boxCount = jobs * STEPS
    const gapCount = jobs * GAPS
    const viewBuffer = yield* acquireBuffer(device, {
      size: VIEW_FLOATS * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    })
    const boxBuffer = yield* acquireBuffer(device, {
      size: Math.max(1, boxCount) * BOX_FLOATS * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    })
    const gapBuffer = yield* acquireBuffer(device, {
      size: Math.max(1, gapCount) * GAP_FLOATS * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    })

    const pipeline = (code: string) => renderPipeline({ device, format, code })

    return {
      device,
      context,
      viewBuffer,
      viewData: new Float32Array(VIEW_FLOATS),
      boxBuffer,
      boxData: new Float32Array(Math.max(1, boxCount) * BOX_FLOATS),
      boxCount,
      gapBuffer,
      gapData: new Float32Array(Math.max(1, gapCount) * GAP_FLOATS),
      gapCount,
      boxes: bound({ device, pipeline: pipeline(BOXES), resources: [whole(viewBuffer), whole(boxBuffer)] }),
      gaps: bound({ device, pipeline: pipeline(GAP_SHADER), resources: [whole(viewBuffer), whole(gapBuffer)] }),
    }
  })

type Gpu = Effect.Success<ReturnType<typeof makeGpu>>

const flag = (on: boolean): number => {
  if (on) return 1
  return 0
}

const at = (values: ReadonlyArray<number>, i: number): number => Option.getOrElse(Arr.get(values, i), () => 0)

interface RowFill {
  readonly job: JobState
  readonly j: number
  readonly row: Row
  readonly now: number
  readonly still: boolean
}

const fillRow = (gpu: Gpu, { job, j, row, now, still }: RowFill) => {
  const t = waveOf(job, { now, still })
  const front = Option.getOrElse(t, () => 0) * row.length
  const length = Math.min(WAVE_PX, row.length * WAVE_TAIL)
  const on = flag(Option.isSome(t))
  const ping = pingOf(job, { now, still })
  row.boxes.forEach((rect, b) => {
    const last = b === STEPS - 1
    gpu.boxData.set(
      [
        rect.x,
        rect.y,
        rect.w,
        rect.h,
        at(job.hover, b),
        flag(last),
        flag(last) * ping,
        flag(row.stacked),
        at(row.boxStarts, b),
        front,
        length,
        on,
        ...row.color,
        0,
      ],
      (j * STEPS + b) * BOX_FLOATS,
    )
  })
  row.gaps.forEach((gap, g) => {
    gpu.gapData.set(
      [...gap.from, ...gap.to, at(row.gapStarts, g), front, length, on, ...row.color, 0],
      (j * GAPS + g) * GAP_FLOATS,
    )
  })
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
    const dpr = fitCanvas(canvas, { round: Math.floor, maxSize: gpu.device.limits.maxTextureDimension2D }).ratio
    gpu.viewData.set([canvas.clientWidth, canvas.clientHeight, dpr, 0])
    gpu.device.queue.writeBuffer(gpu.viewBuffer, 0, gpu.viewData)

    gpu.boxData.fill(0)
    gpu.gapData.fill(0)
    state.jobs.forEach((job, j) => {
      const row = Arr.get(layout, j)
      if (Option.isSome(row)) fillRow(gpu, { job, j, row: row.value, now, still })
    })
    gpu.device.queue.writeBuffer(gpu.boxBuffer, 0, gpu.boxData)
    gpu.device.queue.writeBuffer(gpu.gapBuffer, 0, gpu.gapData)

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
    if (gpu.gapCount > 0) {
      pass.setPipeline(gpu.gaps.pipeline)
      pass.setBindGroup(0, gpu.gaps.group)
      pass.draw(6, gpu.gapCount)
    }
    pass.end()
    gpu.device.queue.submit([encoder.finish()])
  })


type Input = Data.TaggedEnum<{
  Seen: { readonly job: number }
  Pointed: { readonly hovered: Option.Option<Hovered> }
  Tapped: { readonly job: number }
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
              const job = Arr.findFirstIndex(jobs, el => el === entry.target)
              if (Option.isNone(job)) continue
              observer.unobserve(entry.target)
              Queue.offerUnsafe(queue, Input.Seen({ job: job.value }))
            }
          },
          { rootMargin: '0px 0px -12% 0px', threshold: 0.2 },
        )
        for (const job of jobs) observer.observe(job)
        return observer
      }),
      observer => Effect.sync(() => observer.disconnect()),
    ),
  )

const indexIn = <A>(items: ReadonlyArray<A>, item: Option.Option<A>): Option.Option<number> =>
  Option.flatMap(item, found => Arr.findFirstIndex(items, candidate => candidate === found))

const hoveredOn = (jobs: ReadonlyArray<HTMLElement>, target: Element): Option.Option<Hovered> =>
  Option.map(
    indexIn(jobs, Option.fromNullishOr(target.closest<HTMLElement>('[data-job]'))),
    (job): Hovered => ({
      job,
      step: indexIn(
        Array.from(jobs[job]!.querySelectorAll('[data-step]')),
        Option.fromNullishOr(target.closest('[data-step]')),
      ),
    }),
  )

const hoveredAt = (jobs: ReadonlyArray<HTMLElement>, event: Event): Option.Option<Hovered> => {
  if (event.target instanceof Element) return hoveredOn(jobs, event.target)
  return Option.none()
}

const pointed = (
  container: HTMLElement,
  jobs: ReadonlyArray<HTMLElement>,
): Stream.Stream<Input> =>
  Stream.merge(
    Stream.fromEventListener<PointerEvent>(container, 'pointerover', { passive: true }).pipe(
      Stream.filter(event => event.pointerType === 'mouse'),
      Stream.map(event => Input.Pointed({ hovered: hoveredAt(jobs, event) })),
    ),
    Stream.fromEventListener(container, 'pointerleave').pipe(
      Stream.as(Input.Pointed({ hovered: Option.none() })),
    ),
  )

const taps = (
  container: HTMLElement,
  jobs: ReadonlyArray<HTMLElement>,
): Stream.Stream<Input> =>
  Stream.fromEventListener<PointerEvent>(container, 'pointerdown', { passive: true }).pipe(
    Stream.filter(event => event.isPrimary),
    Stream.filterMap(Filter.fromPredicateOption(event => hoveredAt(jobs, event))),
    Stream.map(({ job }) => Input.Tapped({ job })),
  )


export const runWorkDrawing = (
  canvas: HTMLCanvasElement,
  initial: WorkSettings,
  changes: Stream.Stream<WorkSettings>,
): Effect.Effect<void, GpuUnavailable, Scope.Scope> =>
  Effect.gen(function* () {
    const parent = Option.fromNullishOr(canvas.parentElement)
    if (Option.isNone(parent)) return
    const container = parent.value
    const jobs = Array.from(container.querySelectorAll<HTMLElement>('[data-job]'))
    const gpu = yield* makeGpu(canvas, jobs.length)

    const settings = yield* Ref.make(initial)
    const hovered = yield* Ref.make<Option.Option<Hovered>>(Option.none())
    const state = yield* Ref.make(initialWork(jobs.length))
    const layout = yield* Ref.make(measure(canvas, jobs))

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

    const replay = (job: number) =>
      Effect.flatMap(frameTime, now => Ref.update(state, s => replayed(s, { job, now })))

    const handle = Input.$match({
      Seen: ({ job }) => Effect.flatMap(frameTime, now => Ref.update(state, s => seen(s, { job, now }))),
      Pointed: ({ hovered: next }) =>
        Effect.gen(function* () {
          const before = yield* Ref.getAndSet(hovered, next)
          const entered = Option.filter(
            next,
            ({ job }) => !Option.exists(before, previous => previous.job === job),
          )
          if (Option.isSome(entered)) yield* replay(entered.value.job)
        }),
      Tapped: ({ job }) => replay(job),
      Moved: () => Ref.set(layout, measure(canvas, jobs)),
    })

    const inputs = Stream.mergeAll(
      [
        seenJobs(jobs),
        pointed(container, jobs),
        taps(container, jobs),
        resizes([container, ...container.querySelectorAll('[data-step]')]).pipe(Stream.as(Input.Moved())),
        Stream.fromEventListener(window, 'resize').pipe(Stream.as(Input.Moved())),
        fontsReady.pipe(Stream.as(Input.Moved())),
      ],
      { concurrency: 'unbounded' },
    )

    const drawing = yield* wakeToDraw(animate)
    yield* wakeOn({ stream: inputs, wake: drawing.wake, handle })
    yield* wakeOn({ stream: changes, wake: drawing.wake, handle: next => Ref.set(settings, next) })

    yield* markDrawing({ element: container, device: gpu.device })
    yield* drawing.wake
  })
