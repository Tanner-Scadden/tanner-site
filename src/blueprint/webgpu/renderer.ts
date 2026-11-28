import {
  Data,
  Duration,
  Effect,
  Queue,
  Random,
  Ref,
  type Scope,
  Stream,
} from 'effect'

import { type GpuUnavailable, acquireBuffer, acquireContext, acquireDevice, requestAdapter, unavailable } from '../../gpu/device.ts'
import { nextFrame } from '../../gpu/loop.ts'
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
// How fast a pen draws, in CSS px per second.
const PEN_SPEED = { min: 15, max: 125 }
const MAX_PIXEL_RATIO = 2
const PENS_BYTES = PARTICLE_COUNT * PARTICLE_FLOATS * 4
// How often the page counts the zombies, for the INFECTED counter.
const COUNT_EVERY = Duration.millis(250)

// The pens start somewhere on a large field, so they never need reseeding
// when the window grows.
const FIELD = extentFor(Math.max(screen.width, screen.height, 2400))

export const PENS_START = 'data-pens-start'

// Where patient zero starts: on the grid line nearest the WebGPU toggle, in
// the page coordinates the pens use, which wrap every extent (see the
// shaders). The middle of the screen if the toggle isn't there.
const startingPoint = (canvas: HTMLCanvasElement) =>
  Effect.sync((): Point => {
    const box = document.querySelector(`[${PENS_START}]`)?.getBoundingClientRect()
    const x = box === undefined ? canvas.clientWidth / 2 : box.left + box.width / 2
    const y = box === undefined ? canvas.clientHeight / 2 : box.top + box.height / 2
    const wrap = (value: number, extent: number) => value - extent * Math.floor(value / extent)
    const line = Math.round((y + window.scrollY - 0.5) / MINOR) * MINOR + 0.5
    return {
      x: wrap(x + window.scrollX, extentFor(canvas.clientWidth)),
      y: wrap(line, extentFor(canvas.clientHeight)),
    }
  })

// Every pen starts yellow on a random grid line, heading along it at its own
// speed, except patient zero: the zombie that starts the outbreak at `zero`.
const seedPens = (zero: Point) =>
  Effect.gen(function* () {
    const data = new Float32Array(PARTICLE_COUNT * PARTICLE_FLOATS)
    const lines = Math.floor(FIELD / MINOR)
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const alongX = (yield* Random.next) < 0.5
      const speed = yield* Random.nextBetween(PEN_SPEED.min, PEN_SPEED.max)
      const velocity = ((yield* Random.next) < 0.5 ? -1 : 1) * speed
      const along = yield* Random.nextBetween(0, FIELD)
      const line = (yield* Random.nextIntBetween(0, lines - 1)) * MINOR + 0.5
      const [x, y, vx, vy] = alongX
        ? [along, line, velocity, 0]
        : [line, along, 0, velocity]
      data.set([x, y, vx, vy, 0, 0, HEALTHY, 0], i * PARTICLE_FLOATS)
    }
    const heading = (yield* Random.next) < 0.5 ? -1 : 1
    data.set(
      [zero.x, zero.y, heading * PATIENT_ZERO_SPEED, 0, 0, 0, FOREVER, 0],
      PATIENT_ZERO * PARTICLE_FLOATS,
    )
    return data
  })

// A fresh outbreak: new pens, and patient zero by the toggle.
const startOutbreak = (gpu: Gpu, canvas: HTMLCanvasElement) =>
  Effect.gen(function* () {
    const zero = yield* startingPoint(canvas)
    const pens = yield* seedPens(zero)
    gpu.device.queue.writeBuffer(gpu.particleBuffer, 0, pens)
  })

// Every pen yellow again, patient zero too, so the pens fade out clean.
const cureEveryone = (gpu: Gpu) =>
  Effect.sync(() => {
    const healthy = new Float32Array([HEALTHY, 0])
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      gpu.device.queue.writeBuffer(gpu.particleBuffer, (i * PARTICLE_FLOATS + 6) * 4, healthy)
    }
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
      size: PENS_BYTES,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
    })
    // A copy of the pens the page can read, to count the zombies.
    const readback = yield* acquireBuffer(device, {
      size: PENS_BYTES,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    })
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
    const compute = (entryPoint: string) =>
      device.createComputePipeline({
        layout: 'auto',
        compute: { module: simulateModule, entryPoint },
      })
    const simulate = compute('step')
    const infect = compute('infect')
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
      particleBuffer,
      readback,
      frameData: new Float32Array(FRAME_FLOATS),
      background: { pipeline: background, group: bind(background, [frameBuffer]) },
      // Moving first, then biting, as two dispatches: the second sees
      // every pen where the first left it.
      infect: {
        pipeline: infect,
        group: bind(infect, [frameBuffer, particleBuffer]),
      },
      simulate: {
        pipeline: simulate,
        group: bind(simulate, [frameBuffer, particleBuffer]),
      },
      pens: { pipeline: draw, group: bind(draw, [frameBuffer, particleBuffer]) },
    }
  })

type Gpu = Effect.Success<ReturnType<typeof makeGpu>>

// How many pens are zombies right now. Copies the pens off the GPU and reads
// each one's `zombie` (see `struct Pen`). Fails quietly if the copy can't be
// read, such as when the device is lost.
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

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

type Input = Data.TaggedEnum<{
  // A mouse moved over the page. Touch never bends the grid.
  Moved: { readonly pointer: Pointer }
  Left: {}
  // The page scrolled or resized, or the canvas came back into view, so the
  // grid needs one more frame.
  Changed: {}
}>
const Input = Data.taggedEnum<Input>()

const resized = (canvas: HTMLCanvasElement): Stream.Stream<Input> =>
  Stream.callback<Input>(queue =>
    Effect.acquireRelease(
      Effect.sync(() => {
        const observer = new ResizeObserver(() => Queue.offerUnsafe(queue, Input.Changed()))
        observer.observe(canvas)
        return observer
      }),
      observer => Effect.sync(() => observer.disconnect()),
    ),
  )

const sources = (canvas: HTMLCanvasElement): ReadonlyArray<Stream.Stream<Input>> => [
  Stream.fromEventListener<PointerEvent>(window, 'pointermove', { passive: true }).pipe(
    Stream.filter(event => event.pointerType === 'mouse'),
    // Over a block that's interactive in its own right, like a blog
    // animation, the sheet keeps still, as if the cursor had left.
    Stream.map(event =>
      event.target instanceof Element && event.target.closest('[data-blueprint-quiet]') !== null
        ? Input.Left()
        : Input.Moved({ pointer: { x: event.clientX, y: event.clientY, inside: true } }),
    ),
  ),
  Stream.fromEventListener(document.documentElement, 'pointerleave').pipe(
    Stream.as(Input.Left()),
  ),
  Stream.fromEventListener(window, 'scroll', { passive: true }).pipe(
    Stream.as(Input.Changed()),
  ),
  Stream.fromEventListener(window, 'resize').pipe(Stream.as(Input.Changed())),
  resized(canvas),
]

const inputs = (canvas: HTMLCanvasElement) =>
  Stream.mergeAll(sources(canvas), { concurrency: 'unbounded' })

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
// fails with GpuUnavailable when this browser can't run it. While the pens
// run, it tells `infected` how many are zombies.
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
    // One pending wake is enough: the loop reads the latest values anyway.
    const wakes = yield* Queue.sliding<void>(1)
    const started = performance.now()

    const poke = Queue.offer(wakes, undefined)
    // The last count told, so the page only hears when it changes.
    const told = yield* Ref.make(FIRST_INFECTED)

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
      Stream.runForEach(inputs(canvas), input =>
        Effect.andThen(
          Ref.update(pointer, at => pointerAfter(at)(input)),
          poke,
        ),
      ),
    )

    // Turning the pens on starts a new outbreak by the toggle; turning them
    // off cures everyone, so they fade out yellow.
    yield* Effect.forkScoped(
      Stream.runForEach(changes, next =>
        Effect.gen(function* () {
          const before = yield* Ref.get(settings)
          if (next.flow && !before.flow) {
            yield* startOutbreak(gpu, canvas)
            yield* Ref.set(told, FIRST_INFECTED)
          }
          if (!next.flow && before.flow) yield* cureEveryone(gpu)
          yield* Ref.set(settings, next)
          yield* poke
        }),
      ),
    )

    // Counts the zombies a few times a second while the pens run.
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
