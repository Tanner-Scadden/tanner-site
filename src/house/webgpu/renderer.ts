// NOTE: the floor plan drawing, as one scoped Effect like the blueprint. The
// canvas sits over the plan and owns its walls while it runs (the CSS
// borders step aside). The rooms are measured from the DOM, the rules live
// in ./house, and the loop only runs while the house is on screen.

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
  PRINTS,
  type Pet,
  type Pets,
  type Plan,
  type Point,
  type Rect,
  type Rooms,
  draftOf,
  drafted,
  initialPets,
  movePets,
  planFor,
  restingPets,
  stepPets,
  wakePets,
} from './house.ts'
import { DOTS, DOT_FLOATS, WALLS, WALL_FLOATS } from './shaders.ts'

export interface HouseSettings {
  readonly still: boolean
}

const VIEW_FLOATS = 4
const MAX_PIXEL_RATIO = 2
const MAX_WALLS = 48
const MAX_DOTS = 24

const BLEND: GPUBlendState = {
  color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
  alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
}

const rectOf = (el: Element | null, origin: DOMRect): Rect => {
  if (el === null) return { x: 0, y: 0, w: 0, h: 0 }
  const r = el.getBoundingClientRect()
  return { x: r.left - origin.left, y: r.top - origin.top, w: r.width, h: r.height }
}

const measure = (canvas: HTMLCanvasElement, plan: HTMLElement): Plan => {
  const origin = canvas.getBoundingClientRect()
  const room = (name: string) => plan.querySelector(`[data-room="${name}"]`)
  const rooms: Rooms = {
    house: rectOf(plan, origin),
    work: rectOf(room('work'), origin),
    oss: rectOf(room('oss'), origin),
    outside: rectOf(room('outside'), origin),
    locked: rectOf(room('locked'), origin),
  }
  return planFor(rooms)
}

const makeGpu = (canvas: HTMLCanvasElement) =>
  Effect.gen(function* () {
    const adapter = yield* requestAdapter
    const device = yield* acquireDevice(adapter)
    const { context, format } = yield* acquireContext(canvas, device, 'premultiplied')

    const viewBuffer = yield* acquireBuffer(device, {
      size: VIEW_FLOATS * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    })
    const wallBuffer = yield* acquireBuffer(device, {
      size: MAX_WALLS * WALL_FLOATS * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    })
    const dotBuffer = yield* acquireBuffer(device, {
      size: MAX_DOTS * DOT_FLOATS * 4,
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
    const walls = pipeline(WALLS)
    const dots = pipeline(DOTS)

    return {
      device,
      context,
      viewBuffer,
      viewData: new Float32Array(VIEW_FLOATS),
      wallBuffer,
      wallData: new Float32Array(MAX_WALLS * WALL_FLOATS),
      dotBuffer,
      dotData: new Float32Array(MAX_DOTS * DOT_FLOATS),
      walls: { pipeline: walls, group: bind(walls, [viewBuffer, wallBuffer]) },
      dots: { pipeline: dots, group: bind(dots, [viewBuffer, dotBuffer]) },
    }
  })

type Gpu = Effect.Success<ReturnType<typeof makeGpu>>

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

// The extra lines and dots that draw one pet: its body and paw prints, plus
// Teddy's ears or Rain's tail.
interface PetMarks {
  readonly walls: ReadonlyArray<ReadonlyArray<number>>
  readonly dots: ReadonlyArray<ReadonlyArray<number>>
}

const marksFor = (pet: Pet, alpha: number): PetMarks => {
  const { at, heading: h } = pet
  const side: Point = { x: -h.y, y: h.x }
  const gold = pet.name === 'teddy' ? 1 : 0
  const prints = pet.prints.map((p, i) => [
    p.x,
    p.y,
    1.1,
    0,
    gold,
    (((i + 1) / PRINTS) * 0.45 + 0.05) * alpha,
    0,
    0,
  ])
  if (pet.name === 'teddy') {
    const ear = (s: number) => [
      at.x + h.x * 3.2 + side.x * 3 * s,
      at.y + h.y * 3.2 + side.y * 3 * s,
      1.8,
      0,
      1,
      alpha,
      0,
      0,
    ]
    return {
      walls: [],
      dots: [...prints, [at.x, at.y, 4.5, 0, 1, alpha, 0, 0], ear(1), ear(-1)],
    }
  }
  // Rain's tail curls off behind her.
  const tail = [
    at.x - h.x * 3.5,
    at.y - h.y * 3.5,
    at.x - h.x * 8 + side.x * 3,
    at.y - h.y * 8 + side.y * 3,
    1.2,
    1,
    0,
    0,
    0.9 * alpha,
    0,
    0,
    0,
  ]
  return {
    walls: [tail],
    dots: [...prints, [at.x, at.y, 3.6, 1.3, 0, alpha, 0, 0]],
  }
}

const render = (
  gpu: Gpu,
  canvas: HTMLCanvasElement,
  plan: Plan,
  reveal: ReadonlyArray<number>,
  pets: Pets | null,
) =>
  Effect.sync(() => {
    const dpr = fitCanvas(canvas, gpu.device.limits.maxTextureDimension2D)
    gpu.viewData.set([canvas.clientWidth, canvas.clientHeight, dpr, 0])
    gpu.device.queue.writeBuffer(gpu.viewBuffer, 0, gpu.viewData)

    gpu.wallData.fill(0)
    gpu.dotData.fill(0)
    let walls = 0
    let dots = 0
    const addWall = (data: ReadonlyArray<number>) => {
      if (walls >= MAX_WALLS) return
      gpu.wallData.set(data, walls++ * WALL_FLOATS)
    }
    const addDot = (data: ReadonlyArray<number>) => {
      if (dots >= MAX_DOTS) return
      gpu.dotData.set(data, dots++ * DOT_FLOATS)
    }

    plan.walls.forEach((w, i) =>
      // NOTE: the order matches `struct Wall` in the shader.
      addWall([
        w.from.x,
        w.from.y,
        w.to.x,
        w.to.y,
        w.width,
        reveal[i] ?? 0,
        w.gold,
        w.dash,
        w.alpha,
        0,
        0,
        0,
      ]),
    )
    if (pets !== null) {
      for (const pet of [pets.rain, pets.teddy]) {
        const marks = marksFor(pet, 1)
        marks.walls.forEach(addWall)
        marks.dots.forEach(addDot)
      }
    }
    gpu.device.queue.writeBuffer(gpu.wallBuffer, 0, gpu.wallData)
    gpu.device.queue.writeBuffer(gpu.dotBuffer, 0, gpu.dotData)

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
    if (walls > 0) {
      pass.setPipeline(gpu.walls.pipeline)
      pass.setBindGroup(0, gpu.walls.group)
      pass.draw(6, walls)
    }
    if (dots > 0) {
      pass.setPipeline(gpu.dots.pipeline)
      pass.setBindGroup(0, gpu.dots.group)
      pass.draw(6, dots)
    }
    pass.end()
    gpu.device.queue.submit([encoder.finish()])
  })

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

type Input = Data.TaggedEnum<{
  // The house came onto the screen, or left it.
  Shown: { readonly visible: boolean }
  // The pointer moved on the house, or left it.
  Pointed: { readonly pointer: Point | null }
  // The layout changed, so every room is measured again.
  Moved: {}
}>
const Input = Data.taggedEnum<Input>()

const shown = (el: Element): Stream.Stream<Input> =>
  Stream.callback<Input>(queue =>
    Effect.acquireRelease(
      Effect.sync(() => {
        const observer = new IntersectionObserver(entries => {
          for (const entry of entries) {
            Queue.offerUnsafe(queue, Input.Shown({ visible: entry.isIntersecting }))
          }
        })
        observer.observe(el)
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

// A mouse over the house, or a finger on it, calls Teddy over.
const pointed = (canvas: HTMLCanvasElement, house: HTMLElement): Stream.Stream<Input> => {
  const at = (event: PointerEvent): Input => {
    const origin = canvas.getBoundingClientRect()
    return Input.Pointed({
      pointer: { x: event.clientX - origin.left, y: event.clientY - origin.top },
    })
  }
  return Stream.mergeAll(
    [
      Stream.fromEventListener<PointerEvent>(house, 'pointermove', { passive: true }).pipe(
        Stream.map(at),
      ),
      Stream.fromEventListener<PointerEvent>(house, 'pointerdown', { passive: true }).pipe(
        Stream.map(at),
      ),
      Stream.fromEventListener(house, 'pointerleave').pipe(
        Stream.as(Input.Pointed({ pointer: null })),
      ),
    ],
    { concurrency: 'unbounded' },
  )
}

// ---------------------------------------------------------------------------
// The drawing
// ---------------------------------------------------------------------------

// Marks the house while the GPU draws it, so the CSS walls step aside and
// the labels wait for the walls. Closing the scope hands both back to CSS.
const markHouse = (house: HTMLElement) =>
  Effect.acquireRelease(
    Effect.sync(() => {
      house.dataset['gpu'] = 'on'
    }),
    () =>
      Effect.sync(() => {
        delete house.dataset['gpu']
        delete house.dataset['drawn']
      }),
  )

// Starts the drawing on `canvas`, which sits inside the house figure, and
// returns once it's running. It follows `changes` and the page for as long
// as `Scope` stays open, and fails with GpuUnavailable when this browser
// can't run it.
export const runHouseDrawing = (
  canvas: HTMLCanvasElement,
  initial: HouseSettings,
  changes: Stream.Stream<HouseSettings>,
): Effect.Effect<void, GpuUnavailable, Scope.Scope> =>
  Effect.gen(function* () {
    const house = canvas.parentElement
    const planEl = house?.querySelector<HTMLElement>('.plan') ?? null
    if (house === null || planEl === null) return
    const gpu = yield* makeGpu(canvas)

    const settings = yield* Ref.make(initial)
    const plan = yield* Ref.make(measure(canvas, planEl))
    const pointer = yield* Ref.make<Point | null>(null)
    const visible = yield* Ref.make(true)
    // When drafting started, or null until the house is first on screen.
    const draftStart = yield* Ref.make<number | null>(null)
    // Null until the pets move in.
    const pets = yield* Ref.make<Pets | null>(null)
    const wakes = yield* Queue.sliding<void>(1)
    const poke = Queue.offer(wakes, undefined)

    // Draws frames while anything moves, then returns.
    const animate = Effect.gen(function* () {
      yield* Ref.update(pets, p => (p === null ? p : wakePets(p)))
      while (true) {
        const now = yield* nextFrame
        const { still } = yield* Ref.get(settings)
        const current = yield* Ref.get(plan)
        const start = (yield* Ref.updateAndGet(draftStart, s => s ?? now)) ?? now
        const since = now - start
        const done = drafted({ since, still })

        if (done) {
          yield* Effect.sync(() => {
            house.dataset['drawn'] = ''
          })
        }
        const before = yield* Ref.get(pets)
        const moved =
          !done
            ? null
            : before === null
              ? still
                ? restingPets(current)
                : initialPets(current, Math.floor(now))
              : stepPets(before, { now, plan: current, pointer: yield* Ref.get(pointer), still })
        yield* Ref.set(pets, moved)

        yield* render(gpu, canvas, current, draftOf(current.walls, { since, still }), moved)

        // Once it's drawn, a still house or one off screen can rest.
        if (done && (still || !(yield* Ref.get(visible)))) return
      }
    })

    const handle = Input.$match({
      Shown: ({ visible: next }) => Ref.set(visible, next),
      Pointed: ({ pointer: next }) => Ref.set(pointer, next),
      Moved: () =>
        Effect.gen(function* () {
          const before = yield* Ref.get(plan)
          const after = measure(canvas, planEl)
          yield* Ref.set(plan, after)
          // The pointer's spot is stale once the rooms move.
          yield* Ref.set(pointer, null)
          yield* Ref.update(pets, p => (p === null ? p : movePets(p, { from: before, to: after })))
        }),
    })

    const inputs = Stream.mergeAll(
      [
        shown(house),
        pointed(canvas, house),
        resized([house, planEl]),
        Stream.fromEventListener(window, 'resize').pipe(Stream.as(Input.Moved())),
        // Web fonts landing can reflow every room.
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

    // A lost device hands the walls back to CSS, so the plan still reads.
    yield* Effect.forkScoped(
      Effect.andThen(
        Effect.promise(() => gpu.device.lost),
        Effect.sync(() => {
          house.dataset['gpu'] = 'lost'
        }),
      ),
    )

    yield* markHouse(house)
    yield* poke
  })
