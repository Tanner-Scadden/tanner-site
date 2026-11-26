// NOTE: the blueprint renderer, as one scoped Effect. Every GPU object is
// acquired with its release, so closing the scope (the canvas unmounting)
// tears it all down in reverse order. Input arrives as Streams, the frame
// rules live in ./frame as pure functions, and the loop is a fiber that
// sleeps until something wakes it: a still page costs nothing.

import {
  Data,
  Effect,
  Queue,
  Random,
  Ref,
  Schema,
  type Scope,
  Stream,
} from 'effect'

import {
  type Frame,
  MINOR,
  NO_POINTER,
  type Pointer,
  type Settings,
  extentFor,
  initialFrame,
  settled,
  step,
  wake,
} from './frame'
import {
  BACKGROUND,
  PARTICLE_COUNT,
  PARTICLE_FLOATS,
  PENS,
  SIMULATE,
  WORKGROUP,
} from './shaders'

export class GpuUnavailable extends Schema.TaggedError<
  GpuUnavailable,
  { readonly brand: unique symbol }
>()('GpuUnavailable', {
  reason: Schema.Literals(['no-webgpu', 'no-adapter', 'no-device', 'no-context']),
}) {}

const unavailable = (reason: typeof GpuUnavailable.fields.reason.Type) =>
  GpuUnavailable.make({ reason })

const FRAME_FLOATS = 16
const MAX_PIXEL_RATIO = 2

// ---------------------------------------------------------------------------
// Acquiring the GPU
// ---------------------------------------------------------------------------

const requestAdapter = Effect.gen(function* () {
  if (!('gpu' in navigator)) return yield* unavailable('no-webgpu')
  const adapter = yield* Effect.promise(() =>
    navigator.gpu.requestAdapter({ powerPreference: 'low-power' }),
  )
  return adapter ?? (yield* unavailable('no-adapter'))
})

const acquireDevice = (adapter: GPUAdapter) =>
  Effect.acquireRelease(
    Effect.tryPromise({
      try: () => adapter.requestDevice(),
      catch: () => unavailable('no-device'),
    }),
    device => Effect.sync(() => device.destroy()),
  )

const acquireContext = (canvas: HTMLCanvasElement, device: GPUDevice) =>
  Effect.acquireRelease(
    Effect.gen(function* () {
      const context = canvas.getContext('webgpu')
      if (context === null) return yield* unavailable('no-context')
      const format = navigator.gpu.getPreferredCanvasFormat()
      context.configure({ device, format, alphaMode: 'opaque' })
      return { context, format }
    }),
    ({ context }) => Effect.sync(() => context.unconfigure()),
  )

const acquireBuffer = (device: GPUDevice, descriptor: GPUBufferDescriptor) =>
  Effect.acquireRelease(
    Effect.sync(() => device.createBuffer(descriptor)),
    buffer => Effect.sync(() => buffer.destroy()),
  )

// Each pen starts on a random grid line, heading along it at its own speed.
const seedPens = (field: number) =>
  Effect.gen(function* () {
    const data = new Float32Array(PARTICLE_COUNT * PARTICLE_FLOATS)
    const lines = Math.floor(field / MINOR)
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const alongX = (yield* Random.next) < 0.5
      const velocity =
        ((yield* Random.next) < 0.5 ? -1 : 1) *
        (yield* Random.nextBetween(40, 150))
      const along = yield* Random.nextBetween(0, field)
      const line = (yield* Random.nextIntBetween(0, lines - 1)) * MINOR + 0.5
      data.set(
        alongX ? [along, line, velocity, 0] : [line, along, 0, velocity],
        i * PARTICLE_FLOATS,
      )
    }
    return data
  })

const PEN_BLEND: GPUBlendState = {
  color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
  alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
}

// Everything a frame needs, built once per canvas.
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
      size: PARTICLE_COUNT * PARTICLE_FLOATS * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    })
    // The pens start somewhere on a large field, so they never need
    // reseeding when the window grows.
    const field = extentFor(Math.max(screen.width, screen.height, 2400))
    const pens = yield* seedPens(field)
    device.queue.writeBuffer(particleBuffer, 0, pens)

    const module = (code: string) => device.createShaderModule({ code })
    const backgroundModule = module(BACKGROUND)
    const simulateModule = module(SIMULATE)
    const pensModule = module(PENS)

    const background = device.createRenderPipeline({
      layout: 'auto',
      vertex: { module: backgroundModule, entryPoint: 'vs' },
      fragment: { module: backgroundModule, entryPoint: 'fs', targets: [{ format }] },
      primitive: { topology: 'triangle-list' },
    })
    const simulate = device.createComputePipeline({
      layout: 'auto',
      compute: { module: simulateModule, entryPoint: 'step' },
    })
    const draw = device.createRenderPipeline({
      layout: 'auto',
      vertex: { module: pensModule, entryPoint: 'vs' },
      fragment: {
        module: pensModule,
        entryPoint: 'fs',
        targets: [{ format, blend: PEN_BLEND }],
      },
      primitive: { topology: 'triangle-list' },
    })

    const bind = (
      pipeline: GPURenderPipeline | GPUComputePipeline,
      buffers: ReadonlyArray<GPUBuffer>,
    ) =>
      device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: buffers.map((buffer, binding) => ({ binding, resource: { buffer } })),
      })

    return {
      device,
      context,
      frameBuffer,
      frameData: new Float32Array(FRAME_FLOATS),
      background: { pipeline: background, group: bind(background, [frameBuffer]) },
      simulate: {
        pipeline: simulate,
        group: bind(simulate, [frameBuffer, particleBuffer]),
      },
      pens: { pipeline: draw, group: bind(draw, [frameBuffer, particleBuffer]) },
    }
  })

type Gpu = Effect.Success<ReturnType<typeof makeGpu>>

// ---------------------------------------------------------------------------
// Drawing a frame
// ---------------------------------------------------------------------------

// The canvas backing store follows its CSS size times the pixel ratio.
const fitCanvas = (canvas: HTMLCanvasElement) => {
  const dpr = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO)
  const width = Math.max(1, Math.round(canvas.clientWidth * dpr))
  const height = Math.max(1, Math.round(canvas.clientHeight * dpr))
  if (canvas.width !== width) canvas.width = width
  if (canvas.height !== height) canvas.height = height
}

const render = (gpu: Gpu, canvas: HTMLCanvasElement, frame: Frame, time: number) =>
  Effect.sync(() => {
    fitCanvas(canvas)
    const width = canvas.clientWidth
    const height = canvas.clientHeight
    const { state } = frame
    // NOTE: the order matches `struct Frame` in the shaders.
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
      canvas.width / Math.max(width, 1),
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
      compute.setPipeline(gpu.simulate.pipeline)
      compute.setBindGroup(0, gpu.simulate.group)
      compute.dispatchWorkgroups(Math.ceil(PARTICLE_COUNT / WORKGROUP))
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

// The next animation frame's time, cancelled if the fiber is interrupted.
const nextFrame = Effect.callback<number>(resume => {
  const id = requestAnimationFrame(now => resume(Effect.succeed(now)))
  return Effect.sync(() => cancelAnimationFrame(id))
})

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

type Input = Data.TaggedEnum<{
  // A mouse moved over the page. Touch never bends the grid.
  Moved: { readonly pointer: Pointer }
  Left: {}
  // The page scrolled or resized, so the grid needs one more frame.
  Changed: {}
}>
const Input = Data.taggedEnum<Input>()

const sources: ReadonlyArray<Stream.Stream<Input>> = [
  Stream.fromEventListener<PointerEvent>(window, 'pointermove', { passive: true }).pipe(
    Stream.filter(event => event.pointerType === 'mouse'),
    Stream.map(event =>
      Input.Moved({ pointer: { x: event.clientX, y: event.clientY, inside: true } }),
    ),
  ),
  Stream.fromEventListener(document.documentElement, 'pointerleave').pipe(
    Stream.as(Input.Left()),
  ),
  Stream.fromEventListener(window, 'scroll', { passive: true }).pipe(
    Stream.as(Input.Changed()),
  ),
  Stream.fromEventListener(window, 'resize').pipe(Stream.as(Input.Changed())),
]

const inputs = Stream.mergeAll(sources, { concurrency: 'unbounded' })

const pointerAfter = (pointer: Pointer) =>
  Input.$match({
    Moved: ({ pointer: next }) => next,
    Left: () => ({ ...pointer, inside: false }),
    Changed: () => pointer,
  })

// Marks the canvas while the GPU draws it, so CSS and tests can tell.
const markCanvas = (canvas: HTMLCanvasElement) =>
  Effect.acquireRelease(
    Effect.sync(() => {
      canvas.dataset['gpu'] = 'on'
    }),
    () =>
      Effect.sync(() => {
        delete canvas.dataset['gpu']
      }),
  )

// ---------------------------------------------------------------------------
// The blueprint
// ---------------------------------------------------------------------------

// Starts the blueprint on `canvas` and returns once it's drawing. It follows
// `changes` and the page's input for as long as `Scope` stays open, and
// fails with GpuUnavailable when this browser can't run it.
export const runBlueprint = (
  canvas: HTMLCanvasElement,
  initial: Settings,
  changes: Stream.Stream<Settings>,
): Effect.Effect<void, GpuUnavailable, Scope.Scope> =>
  Effect.gen(function* () {
    const gpu = yield* makeGpu(canvas)

    const settings = yield* Ref.make(initial)
    const pointer = yield* Ref.make(NO_POINTER)
    const state = yield* Ref.make(initialFrame(initial))
    // One pending wake is enough: the loop reads the latest values anyway.
    const wakes = yield* Queue.sliding<void>(1)
    const started = performance.now()

    const poke = Queue.offer(wakes, undefined)

    // Draws frames until the page settles, then returns.
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

    yield* Effect.forkScoped(Effect.forever(Effect.andThen(Queue.take(wakes), animate)))

    yield* Effect.forkScoped(
      Stream.runForEach(inputs, input =>
        Effect.andThen(
          Ref.update(pointer, at => pointerAfter(at)(input)),
          poke,
        ),
      ),
    )

    yield* Effect.forkScoped(
      Stream.runForEach(changes, next =>
        Effect.andThen(Ref.set(settings, next), poke),
      ),
    )

    // A lost device leaves the CSS grid showing, so the page still looks right.
    yield* Effect.forkScoped(
      Effect.andThen(
        Effect.promise(() => gpu.device.lost),
        Effect.sync(() => {
          canvas.dataset['gpu'] = 'lost'
        }),
      ),
    )

    yield* markCanvas(canvas)
    yield* poke
  })
