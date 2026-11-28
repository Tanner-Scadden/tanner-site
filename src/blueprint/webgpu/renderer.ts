import {
  Data,
  Duration,
  Effect,
  Option,
  Random,
  Ref,
  type Scope,
  Stream,
} from 'effect'

import { fitCanvas } from '../../gpu/canvas.ts'
import {
  type GpuUnavailable,
  acquireBuffer,
  acquireContext,
  acquireDevice,
  markDrawing,
  requestAdapter,
  unavailable,
} from '../../gpu/device.ts'
import { frameTime, nextFrame, wakeOn, wakeToDraw } from '../../gpu/loop.ts'
import { resizes } from '../../gpu/observe.ts'
import { bound, renderPipeline, whole } from '../../gpu/pipeline.ts'
import {
  type Frame,
  MINOR,
  NO_POINTER,
  type Point,
  type Pointer,
  type Settings,
  extentFor,
  initialFrame,
  settled,
  step,
  wake,
} from './frame.ts'
import {
  BACKGROUND,
  FIRST_INFECTED,
  FOREVER,
  HEALTHY,
  PARTICLE_COUNT,
  PARTICLE_FLOATS,
  PATIENT_ZERO,
  PATIENT_ZERO_SPEED,
  PENS,
  SIMULATE,
  WORKGROUP,
} from './shaders.ts'

const FRAME_FLOATS = 16
const PEN_SPEED = { min: 15, max: 125 }
const PENS_BYTES = PARTICLE_COUNT * PARTICLE_FLOATS * 4
const COUNT_EVERY = Duration.millis(250)

const FIELD = extentFor(Math.max(screen.width, screen.height, 2400))

export const PENS_START = 'data-pens-start'

const startingPoint = (canvas: HTMLCanvasElement) =>
  Effect.sync((): Point => {
    const { x, y } = Option.match(Option.fromNullishOr(document.querySelector(`[${PENS_START}]`)), {
      onNone: () => ({ x: canvas.clientWidth / 2, y: canvas.clientHeight / 2 }),
      onSome: start => {
        const box = start.getBoundingClientRect()
        return { x: box.left + box.width / 2, y: box.top + box.height / 2 }
      },
    })
    const wrap = (value: number, extent: number) => value - extent * Math.floor(value / extent)
    const line = Math.round((y + window.scrollY - 0.5) / MINOR) * MINOR + 0.5
    return {
      x: wrap(x + window.scrollX, extentFor(canvas.clientWidth)),
      y: wrap(line, extentFor(canvas.clientHeight)),
    }
  })

const coinSign = Effect.map(Random.next, roll => {
  if (roll < 0.5) return -1
  return 1
})

const penAt = (alongX: boolean, along: number, line: number, velocity: number): ReadonlyArray<number> => {
  if (alongX) return [along, line, velocity, 0]
  return [line, along, 0, velocity]
}

const seedPens = (zero: Point) =>
  Effect.gen(function* () {
    const data = new Float32Array(PARTICLE_COUNT * PARTICLE_FLOATS)
    const lines = Math.floor(FIELD / MINOR)
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const alongX = (yield* Random.next) < 0.5
      const speed = yield* Random.nextBetween(PEN_SPEED.min, PEN_SPEED.max)
      const velocity = (yield* coinSign) * speed
      const along = yield* Random.nextBetween(0, FIELD)
      const line = (yield* Random.nextIntBetween(0, lines - 1)) * MINOR + 0.5
      data.set([...penAt(alongX, along, line, velocity), 0, 0, HEALTHY, 0], i * PARTICLE_FLOATS)
    }
    const heading = yield* coinSign
    data.set(
      [zero.x, zero.y, heading * PATIENT_ZERO_SPEED, 0, 0, 0, FOREVER, 0],
      PATIENT_ZERO * PARTICLE_FLOATS,
    )
    return data
  })

const startOutbreak = (gpu: Gpu, canvas: HTMLCanvasElement) =>
  Effect.gen(function* () {
    const zero = yield* startingPoint(canvas)
    const pens = yield* seedPens(zero)
    gpu.device.queue.writeBuffer(gpu.particleBuffer, 0, pens)
  })

const cureEveryone = (gpu: Gpu) =>
  Effect.sync(() => {
    const healthy = new Float32Array([HEALTHY, 0])
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      gpu.device.queue.writeBuffer(gpu.particleBuffer, (i * PARTICLE_FLOATS + 6) * 4, healthy)
    }
  })

const makeGpu = (canvas: HTMLCanvasElement) =>
  Effect.gen(function* () {
    const adapter = yield* requestAdapter
    const device = yield* acquireDevice(adapter)
    const { context, format } = yield* acquireContext(canvas, device)

    const frameBuffer = yield* acquireBuffer(device, {
      size: FRAME_FLOATS * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    })
    const particleBuffer = yield* acquireBuffer(device, {
      size: PENS_BYTES,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
    })
    const readback = yield* acquireBuffer(device, {
      size: PENS_BYTES,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    })
    const backgroundModule = device.createShaderModule({ code: BACKGROUND })
    const background = device.createRenderPipeline({
      layout: 'auto',
      vertex: { module: backgroundModule, entryPoint: 'vs' },
      fragment: { module: backgroundModule, entryPoint: 'fs', targets: [{ format }] },
      primitive: { topology: 'triangle-list' },
    })
    const simulateModule = device.createShaderModule({ code: SIMULATE })
    const compute = (entryPoint: string) =>
      device.createComputePipeline({
        layout: 'auto',
        compute: { module: simulateModule, entryPoint },
      })
    const pens = [whole(frameBuffer), whole(particleBuffer)]

    return {
      device,
      context,
      frameBuffer,
      particleBuffer,
      readback,
      frameData: new Float32Array(FRAME_FLOATS),
      background: bound({ device, pipeline: background, resources: [whole(frameBuffer)] }),
      infect: bound({ device, pipeline: compute('infect'), resources: pens }),
      simulate: bound({ device, pipeline: compute('step'), resources: pens }),
      pens: bound({
        device,
        pipeline: renderPipeline({ device, format, code: PENS }),
        resources: pens,
      }),
    }
  })

type Gpu = Effect.Success<ReturnType<typeof makeGpu>>

const countInfected = (gpu: Gpu) =>
  Effect.gen(function* () {
    const encoder = gpu.device.createCommandEncoder()
    encoder.copyBufferToBuffer(gpu.particleBuffer, 0, gpu.readback, 0, PENS_BYTES)
    gpu.device.queue.submit([encoder.finish()])
    yield* Effect.tryPromise({
      try: () => gpu.readback.mapAsync(GPUMapMode.READ),
      catch: () => unavailable('no-device'),
    })
    const pens = new Float32Array(gpu.readback.getMappedRange())
    let infected = 0
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      if (pens[i * PARTICLE_FLOATS + 6]! > 0) infected++
    }
    gpu.readback.unmap()
    return infected
  })


const render = (gpu: Gpu, canvas: HTMLCanvasElement, frame: Frame, time: number) =>
  Effect.sync(() => {
    const { width, height, ratio } = fitCanvas(canvas)
    const { state } = frame
    gpu.frameData.set([
      width,
      height,
      window.scrollX,
      window.scrollY,
      state.eased.x,
      state.eased.y,
      extentFor(width),
      extentFor(height),
      state.warp,
      state.flow,
      ratio,
      frame.dt,
      time / 1000,
      state.seed,
      0,
      0,
    ])
    gpu.device.queue.writeBuffer(gpu.frameBuffer, 0, gpu.frameData)

    const encoder = gpu.device.createCommandEncoder()
    if (frame.stepPens) {
      const compute = encoder.beginComputePass()
      const groups = Math.ceil(PARTICLE_COUNT / WORKGROUP)
      for (const stage of [gpu.simulate, gpu.infect]) {
        compute.setPipeline(stage.pipeline)
        compute.setBindGroup(0, stage.group)
        compute.dispatchWorkgroups(groups)
      }
      compute.end()
    }
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: gpu.context.getCurrentTexture().createView(),
          loadOp: 'clear',
          storeOp: 'store',
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
        },
      ],
    })
    pass.setPipeline(gpu.background.pipeline)
    pass.setBindGroup(0, gpu.background.group)
    pass.draw(3)
    if (frame.drawPens) {
      pass.setPipeline(gpu.pens.pipeline)
      pass.setBindGroup(0, gpu.pens.group)
      pass.draw(6, PARTICLE_COUNT)
    }
    pass.end()
    gpu.device.queue.submit([encoder.finish()])
  })


type Input = Data.TaggedEnum<{
  Moved: { readonly pointer: Pointer }
  Left: {}
  Changed: {}
}>
const Input = Data.taggedEnum<Input>()

const inQuiet = (event: Event): boolean =>
  event.target instanceof Element &&
  Option.isSome(Option.fromNullishOr(event.target.closest('[data-blueprint-quiet]')))

const movedTo = (event: PointerEvent): Input => {
  if (inQuiet(event)) return Input.Left()
  return Input.Moved({ pointer: { x: event.clientX, y: event.clientY, inside: true } })
}

const sources = (canvas: HTMLCanvasElement): ReadonlyArray<Stream.Stream<Input>> => [
  Stream.fromEventListener<PointerEvent>(window, 'pointermove', { passive: true }).pipe(
    Stream.filter(event => event.pointerType === 'mouse'),
    Stream.map(movedTo),
  ),
  Stream.fromEventListener(document.documentElement, 'pointerleave').pipe(
    Stream.as(Input.Left()),
  ),
  Stream.fromEventListener(window, 'scroll', { passive: true }).pipe(
    Stream.as(Input.Changed()),
  ),
  Stream.fromEventListener(window, 'resize').pipe(Stream.as(Input.Changed())),
  resizes([canvas]).pipe(Stream.as(Input.Changed())),
]

const inputs = (canvas: HTMLCanvasElement) =>
  Stream.mergeAll(sources(canvas), { concurrency: 'unbounded' })

const pointerAfter = (pointer: Pointer) =>
  Input.$match({
    Moved: ({ pointer: next }) => next,
    Left: () => ({ ...pointer, inside: false }),
    Changed: () => pointer,
  })


export const runBlueprint = (
  canvas: HTMLCanvasElement,
  initial: Settings,
  changes: Stream.Stream<Settings>,
  infected: (count: number) => Effect.Effect<void>,
): Effect.Effect<void, GpuUnavailable, Scope.Scope> =>
  Effect.gen(function* () {
    const gpu = yield* makeGpu(canvas)
    yield* startOutbreak(gpu, canvas)

    const settings = yield* Ref.make(initial)
    const pointer = yield* Ref.make(NO_POINTER)
    const state = yield* Ref.make(initialFrame(initial))
    const started = yield* frameTime
    const told = yield* Ref.make(FIRST_INFECTED)

    const animate = Effect.gen(function* () {
      yield* Ref.update(state, wake)
      while (true) {
        const now = yield* nextFrame
        const moment = {
          settings: yield* Ref.get(settings),
          pointer: yield* Ref.get(pointer),
        }
        const frame = yield* Ref.modify(state, before => {
          const next = step(before, { ...moment, now })
          return [next, next.state]
        })
        yield* render(gpu, canvas, frame, now - started)
        if (settled(frame.state, moment)) return
      }
    })

    const { wake: poke } = yield* wakeToDraw(animate)

    yield* wakeOn({
      stream: inputs(canvas),
      wake: poke,
      handle: input => Ref.update(pointer, at => pointerAfter(at)(input)),
    })

    yield* wakeOn({
      stream: changes,
      wake: poke,
      handle: next =>
        Effect.gen(function* () {
          const before = yield* Ref.get(settings)
          if (next.flow && !before.flow) {
            yield* startOutbreak(gpu, canvas)
            yield* Ref.set(told, FIRST_INFECTED)
          }
          if (!next.flow && before.flow) yield* cureEveryone(gpu)
          yield* Ref.set(settings, next)
        }),
    })

    yield* Effect.forkScoped(
      Effect.forever(
        Effect.gen(function* () {
          yield* Effect.sleep(COUNT_EVERY)
          const { flow } = yield* Ref.get(settings)
          if (!flow) return
          const count = yield* countInfected(gpu)
          const last = yield* Ref.getAndSet(told, count)
          if (count !== last) yield* infected(count)
        }).pipe(Effect.ignore),
      ),
    )

    yield* markDrawing({ element: canvas, device: gpu.device })
    yield* poke
  })
