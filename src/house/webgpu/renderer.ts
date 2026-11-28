import { Data, Effect, Ref, type Scope, Stream } from 'effect'

import { fitCanvas } from '../../gpu/canvas.ts'
import { type GpuUnavailable, acquireBuffer, acquireGpu, markDrawing } from '../../gpu/device.ts'
import { nextFrame, stepBetween, wakeOn, wakeToDraw } from '../../gpu/loop.ts'
import { fontsReady, resizes, visibility } from '../../gpu/observe.ts'
import { bound, renderPipeline, whole } from '../../gpu/pipeline.ts'
import {
  type Draft,
  MAX_WALLS,
  PRINTS,
  ROOMS as ROOM_ORDER,
  type Pet,
  type Print,
  type Pets,
  type Plan,
  type Point,
  barkOf,
  draftOf,
  drafted,
  frameOf,
  initialPets,
  movePets,
  planFor,
  printAlpha,
  restingPets,
  stepPets,
  wakePets,
} from './house.ts'
import {
  DOTS,
  DOT_FLOATS,
  FLOOR,
  LINES,
  PANELS,
  ROOMS,
  ROOM_FLOATS,
  SPRITE_FLOATS,
  STROKES,
  WALL_FLOATS,
  spritesShader,
} from './shaders.ts'
import {
  BARK_FROM,
  CELL_H,
  CELL_W,
  COLS,
  RAIN_ROW,
  ROWS,
  SHEET_LEVELS,
  TEDDY_ROW,
  drawSheet,
} from './sprites.ts'
import {
  LEVEL,
  type Tilt,
  type View,
  columns,
  cssTransform,
  fitFor,
  followTilt,
  liftOf,
  project,
  tiltToward,
  unproject,
  viewOf,
} from './view.ts'

export interface HouseSettings {
  readonly still: boolean
}

const VIEW_FLOATS = 32
const MAX_ROOMS = ROOM_ORDER.length
// Five dots a paw print.
const MAX_DOTS = PRINTS * 2 * 5
const MAX_SPRITES = 2
const MAX_BARKS = 3
const DEPTH_FORMAT: GPUTextureFormat = 'depth24plus'

const rectOf = (el: Element | null, origin: DOMRect) => {
  if (el === null) return { x: 0, y: 0, w: 0, h: 0 }
  const r = el.getBoundingClientRect()
  return { x: r.left - origin.left, y: r.top - origin.top, w: r.width, h: r.height }
}

const measure = (canvas: HTMLCanvasElement, plan: HTMLElement): Plan => {
  const transform = plan.style.transform
  plan.style.transform = ''
  const origin = canvas.getBoundingClientRect()
  const room = (name: string) => plan.querySelector(`[data-room="${name}"]`)
  const measured = planFor({
    house: rectOf(plan, origin),
    library: rectOf(room('library'), origin),
    work: rectOf(room('work'), origin),
    oss: rectOf(room('oss'), origin),
    outside: rectOf(room('outside'), origin),
    locked: rectOf(room('locked'), origin),
  })
  plan.style.transform = transform
  return measured
}

interface Depth {
  texture: GPUTexture | null
}

const makeGpu = (canvas: HTMLCanvasElement) =>
  Effect.gen(function* () {
    const { device, context, format } = yield* acquireGpu(canvas, 'premultiplied')

    const storage = (size: number) =>
      acquireBuffer(device, { size, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST })
    const viewBuffer = yield* acquireBuffer(device, {
      size: VIEW_FLOATS * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    })
    const wallBuffer = yield* storage(MAX_WALLS * WALL_FLOATS * 4)
    const roomBuffer = yield* storage(MAX_ROOMS * ROOM_FLOATS * 4)
    const barkBuffer = yield* storage(MAX_BARKS * WALL_FLOATS * 4)
    const dotBuffer = yield* storage(MAX_DOTS * DOT_FLOATS * 4)
    const spriteBuffer = yield* storage(MAX_SPRITES * SPRITE_FLOATS * 4)

    // Teddy and Rain, drawn once onto a sheet, a level at a time.
    const sheet = yield* Effect.acquireRelease(
      Effect.sync(() => {
        const levels = Array.from({ length: SHEET_LEVELS }, (_, level) => drawSheet(level))
        const [top] = levels
        const texture = device.createTexture({
          size: [top?.width ?? 1, top?.height ?? 1],
          format: 'rgba8unorm',
          mipLevelCount: levels.length,
          usage:
            GPUTextureUsage.TEXTURE_BINDING |
            GPUTextureUsage.COPY_DST |
            GPUTextureUsage.RENDER_ATTACHMENT,
        })
        levels.forEach((source, mipLevel) =>
          device.queue.copyExternalImageToTexture(
            { source },
            { texture, mipLevel, premultipliedAlpha: true },
            [source.width, source.height],
          ),
        )
        return texture
      }),
      texture => Effect.sync(() => texture.destroy()),
    )
    const sampler = device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
      mipmapFilter: 'linear',
    })

    // Sized to the canvas on the first frame and whenever it changes.
    const depth = yield* Effect.acquireRelease(
      Effect.sync((): Depth => ({ texture: null })),
      d => Effect.sync(() => d.texture?.destroy()),
    )

    const pipeline = (
      code: string,
      {
        fragment = 'fs',
        depthWrite = false,
        depthCompare = 'always',
        writeMask = GPUColorWrite.ALL,
      }: {
        fragment?: string
        depthWrite?: boolean
        depthCompare?: GPUCompareFunction
        writeMask?: number
      } = {},
    ) =>
      renderPipeline({
        device,
        format,
        code,
        fragment,
        writeMask,
        depth: { format: DEPTH_FORMAT, depthWriteEnabled: depthWrite, depthCompare },
      })
    const bind = (pipeline: GPURenderPipeline, resources: ReadonlyArray<GPUBindingResource>) =>
      bound({ device, pipeline, resources })
    const spriteCode = spritesShader(COLS, ROWS)
    const spriteResources = [whole(viewBuffer), whole(spriteBuffer), sheet.createView(), sampler]

    return {
      device,
      context,
      depth,
      viewBuffer,
      viewData: new Float32Array(VIEW_FLOATS),
      wallBuffer,
      wallData: new Float32Array(MAX_WALLS * WALL_FLOATS),
      roomBuffer,
      roomData: new Float32Array(MAX_ROOMS * ROOM_FLOATS),
      barkBuffer,
      barkData: new Float32Array(MAX_BARKS * WALL_FLOATS),
      dotBuffer,
      dotData: new Float32Array(MAX_DOTS * DOT_FLOATS),
      spriteBuffer,
      spriteData: new Float32Array(MAX_SPRITES * SPRITE_FLOATS),
      floor: bind(pipeline(FLOOR), [whole(viewBuffer)]),
      rooms: bind(pipeline(ROOMS), [whole(viewBuffer), whole(roomBuffer)]),
      strokes: bind(pipeline(STROKES), [whole(viewBuffer), whole(wallBuffer)]),
      // The walls give way to whatever pet stands in front of them.
      panels: bind(pipeline(PANELS, { depthCompare: 'less' }), [
        whole(viewBuffer),
        whole(wallBuffer),
      ]),
      barks: bind(pipeline(LINES), [whole(viewBuffer), whole(barkBuffer)]),
      dots: bind(pipeline(DOTS), [whole(viewBuffer), whole(dotBuffer)]),
      solids: bind(
        pipeline(spriteCode, {
          fragment: 'solid',
          depthWrite: true,
          depthCompare: 'less',
          writeMask: 0,
        }),
        spriteResources,
      ),
      sprites: bind(pipeline(spriteCode), spriteResources),
    }
  })

type Gpu = Effect.Success<ReturnType<typeof makeGpu>>

const depthView = (gpu: Gpu, canvas: HTMLCanvasElement): GPUTextureView => {
  const current = gpu.depth.texture
  if (current === null || current.width !== canvas.width || current.height !== canvas.height) {
    current?.destroy()
    gpu.depth.texture = gpu.device.createTexture({
      size: [canvas.width, canvas.height],
      format: DEPTH_FORMAT,
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    })
  }
  return gpu.depth.texture!.createView()
}

// One paw print on the floor: a pad and four toes ahead of it, fading with
// age, each placed in the house and then on the screen.
const pawDots = (
  print: Print,
  gold: number,
  now: number,
  view: View,
): ReadonlyArray<ReadonlyArray<number>> => {
  const alpha = printAlpha(print, now) * 0.8
  if (alpha <= 0) return []
  const { at, heading: h } = print
  const size = gold === 1 ? 1.3 : 1.1
  const dot = (x: number, y: number, radius: number) => {
    const p = project(view, { x, y, z: 0 })
    return [p.x, p.y, radius * p.scale, 0, gold, alpha, 0, 0]
  }
  const toe = (turn: number, reach: number) => {
    const c = Math.cos(turn)
    const s = Math.sin(turn)
    const dx = h.x * c - h.y * s
    const dy = h.x * s + h.y * c
    return dot(at.x + dx * reach * size, at.y + dy * reach * size, 0.55 * size)
  }
  return [
    dot(at.x, at.y, 1.25 * size),
    toe(-1.05, 2),
    toe(-0.36, 2.3),
    toe(0.36, 2.3),
    toe(1.05, 2),
  ]
}

// How big the pets are: about a tenth of the house, within reason.
const petWidth = (plan: Plan): number => Math.min(50, Math.max(30, (plan.inside.w + 16) / 10))

// Where a pet stands on the screen: upright and facing the viewer, its feet
// on its spot on the floor, smaller the further back it is.
interface Placed {
  readonly left: number
  readonly top: number
  readonly w: number
  readonly h: number
  readonly depth: number
}

const place = (pet: Pet, plan: Plan, view: View): Placed => {
  const feet = project(view, { x: pet.at.x, y: pet.at.y, z: 0 })
  const w = petWidth(plan) * (pet.name === 'rain' ? 0.92 : 1) * feet.scale
  const h = (w * CELL_H) / CELL_W
  const ground = (44 / CELL_H) * h
  // A hair toward the viewer, so a pet right against a wall stays in front.
  return { left: feet.x - w / 2, top: feet.y - ground, w, h, depth: Math.max(0, feet.depth - 0.002) }
}

const spriteFor = (pet: Pet, at: Placed): ReadonlyArray<number> => [
  at.left,
  at.top,
  at.w,
  at.h,
  frameOf(pet),
  pet.name === 'teddy' ? TEDDY_ROW : RAIN_ROW,
  pet.facing < 0 ? 1 : 0,
  1,
  at.depth,
  0,
  0,
  0,
]

// A bark: three short gold lines bursting out of Teddy's mouth, `t` of the
// way through.
const barkLines = (pet: Pet, at: Placed, t: number): ReadonlyArray<ReadonlyArray<number>> => {
  const unit = at.w / CELL_W
  const facing = pet.facing < 0 ? -1 : 1
  const mouthX = facing > 0 ? BARK_FROM[0] : CELL_W - BARK_FROM[0]
  const x = at.left + mouthX * unit
  const y = at.top + BARK_FROM[1] * unit
  const near = (3 + t * 9) * unit
  const far = near + 7 * unit
  return [-0.55, 0, 0.55].map(turn => {
    const dx = Math.cos(turn) * facing
    const dy = Math.sin(turn) - 0.25
    return [x + dx * near, y + dy * near, x + dx * far, y + dy * far, 1.6, 1, 1, 0, 1 - t * t, 0, 0, 0, 0, 0, 0, 0]
  })
}

interface Scene {
  readonly plan: Plan
  readonly draft: Draft
  readonly pets: Pets | null
  readonly view: View
  readonly lift: number
  readonly now: number
}

const render = (gpu: Gpu, canvas: HTMLCanvasElement, { plan, draft, pets, view, lift, now }: Scene) =>
  Effect.sync(() => {
    const dpr = fitCanvas(canvas, { round: Math.floor, maxSize: gpu.device.limits.maxTextureDimension2D }).ratio
    const { house } = plan.rooms
    gpu.viewData.set([canvas.clientWidth, canvas.clientHeight, dpr, now / 1000])
    gpu.viewData.set(columns(view.gpu), 4)
    gpu.viewData.set(
      [house.x, house.y, house.w, house.h, lift, view.height, draft.fill, draft.sketch],
      20,
    )
    gpu.device.queue.writeBuffer(gpu.viewBuffer, 0, gpu.viewData)

    gpu.wallData.fill(0)
    gpu.roomData.fill(0)
    gpu.barkData.fill(0)
    gpu.dotData.fill(0)
    gpu.spriteData.fill(0)
    const walls = Math.min(plan.walls.length, MAX_WALLS)
    plan.walls.slice(0, walls).forEach((w, i) =>
      gpu.wallData.set(
        [
          w.from.x,
          w.from.y,
          w.to.x,
          w.to.y,
          w.width,
          draft.sketch,
          w.gold,
          w.dash,
          w.alpha,
          w.rise,
          w.base,
          0,
          w.lean.x,
          w.lean.y,
          0,
          0,
        ],
        i * WALL_FLOATS,
      ),
    )

    ROOM_ORDER.forEach((name, i) => {
      const r = plan.rooms[name]
      gpu.roomData.set(
        [r.x, r.y, r.w, r.h, name === 'locked' ? 1 : 0, draft.rooms[i] ?? 0, 0, 0],
        i * ROOM_FLOATS,
      )
    })

    let dots = 0
    let sprites = 0
    let barks = 0
    if (pets !== null) {
      for (const pet of [pets.rain, pets.teddy]) {
        const gold = pet.name === 'teddy' ? 1 : 0
        for (const print of pet.prints) {
          for (const dot of pawDots(print, gold, now, view)) {
            if (dots < MAX_DOTS) gpu.dotData.set(dot, dots++ * DOT_FLOATS)
          }
        }
      }
      // Whoever is nearer the viewer is drawn over the other.
      const placed = [pets.rain, pets.teddy]
        .map(pet => ({ pet, at: place(pet, plan, view) }))
        .sort((a, b) => b.at.depth - a.at.depth)
      for (const { pet, at } of placed) {
        if (sprites < MAX_SPRITES) gpu.spriteData.set(spriteFor(pet, at), sprites++ * SPRITE_FLOATS)
        const bark = pet.name === 'teddy' ? barkOf(pet, now) : null
        if (bark !== null) {
          for (const line of barkLines(pet, at, bark)) {
            if (barks < MAX_BARKS) gpu.barkData.set(line, barks++ * WALL_FLOATS)
          }
        }
      }
    }
    gpu.device.queue.writeBuffer(gpu.wallBuffer, 0, gpu.wallData)
    gpu.device.queue.writeBuffer(gpu.roomBuffer, 0, gpu.roomData)
    gpu.device.queue.writeBuffer(gpu.barkBuffer, 0, gpu.barkData)
    gpu.device.queue.writeBuffer(gpu.dotBuffer, 0, gpu.dotData)
    gpu.device.queue.writeBuffer(gpu.spriteBuffer, 0, gpu.spriteData)

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
      depthStencilAttachment: {
        view: depthView(gpu, canvas),
        depthClearValue: 1,
        depthLoadOp: 'clear',
        depthStoreOp: 'discard',
      },
    })
    const draw = (
      stage: { readonly pipeline: GPURenderPipeline; readonly group: GPUBindGroup },
      vertices: number,
      instances: number,
    ) => {
      if (instances <= 0) return
      pass.setPipeline(stage.pipeline)
      pass.setBindGroup(0, stage.group)
      pass.draw(vertices, instances)
    }
    // The floor and everything on it, then the pets, then the walls over
    // them wherever a wall stands in front.
    if (lift > 0) draw(gpu.floor, 6, 1)
    draw(gpu.rooms, 6, MAX_ROOMS)
    draw(gpu.strokes, 6, walls)
    draw(gpu.dots, 6, dots)
    draw(gpu.solids, 6, sprites)
    draw(gpu.sprites, 6, sprites)
    if (view.height > 0) draw(gpu.panels, 6, walls)
    draw(gpu.barks, 6, barks)
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
// the labels wait for the walls. Closing the scope hands both back to CSS,
// and lays the plan flat again. A lost device hands the walls back too,
// flat, so the plan still reads.
const markHouse = (house: HTMLElement, plan: HTMLElement, device: GPUDevice) =>
  Effect.gen(function* () {
    yield* Effect.sync(() => {
      house.dataset['drafting'] = ''
    })
    yield* markDrawing({
      element: house,
      device,
      lost: Effect.sync(() => {
        plan.style.transform = ''
      }),
      released: Effect.sync(() => {
        delete house.dataset['drafting']
        plan.style.transform = ''
      }),
    })
  })

// Starts the drawing on `canvas`, which sits inside the house figure, and
// returns once it's running. It follows `changes` and the page for as long
// as `Scope` stays open, runs `played` each time Teddy starts playing, and
// fails with GpuUnavailable when this browser can't run it.
export const runHouseDrawing = (
  canvas: HTMLCanvasElement,
  initial: HouseSettings,
  changes: Stream.Stream<HouseSettings>,
  played: Effect.Effect<void>,
): Effect.Effect<void, GpuUnavailable, Scope.Scope> =>
  Effect.gen(function* () {
    const house = canvas.parentElement
    const planEl = house?.querySelector<HTMLElement>('[data-plan]') ?? null
    if (house === null || planEl === null) return
    const gpu = yield* makeGpu(canvas)

    const settings = yield* Ref.make(initial)
    const plan = yield* Ref.make(measure(canvas, planEl))
    // The pointer on the canvas, on the screen, or null.
    const pointer = yield* Ref.make<Point | null>(null)
    const visible = yield* Ref.make(true)
    // When drafting started, or null until the house is first on screen.
    const draftStart = yield* Ref.make<number | null>(null)
    // Null until the pets move in.
    const pets = yield* Ref.make<Pets | null>(null)
    const tilt = yield* Ref.make<Tilt>(LEVEL)
    // The previous frame's time, or null at the start of a burst.
    const last = yield* Ref.make<number | null>(null)
    // The plan's CSS transform, as last set.
    const transform = yield* Ref.make('')

    // Draws frames while anything moves, then returns.
    const animate = Effect.gen(function* () {
      yield* Ref.update(pets, p => (p === null ? p : wakePets(p)))
      yield* Ref.set(last, null)
      while (true) {
        const now = yield* nextFrame
        const { still } = yield* Ref.get(settings)
        const current = yield* Ref.get(plan)
        const { house: outline } = current.rooms
        const start = (yield* Ref.updateAndGet(draftStart, s => s ?? now)) ?? now
        const since = now - start
        const done = drafted({ since, still })
        const lift = liftOf({ since, still })
        const before = yield* Ref.getAndSet(last, now)
        const dt = stepBetween({ before, now })

        // The house leans toward the pointer once it's up.
        const at = yield* Ref.get(pointer)
        const leaning = still || lift < 1 ? LEVEL : tiltToward(at, outline)
        const leaned = yield* Ref.updateAndGet(tilt, t =>
          still ? LEVEL : followTilt(t, { to: leaning, dt }),
        )
        const view = viewOf(outline, { tilt: leaned, lift, fit: fitFor(outline) })

        // The room links ride the same view, so they stay on their floors.
        const css = lift > 0 ? cssTransform(view, { x: outline.x, y: outline.y }) : ''
        if ((yield* Ref.getAndSet(transform, css)) !== css) {
          yield* Effect.sync(() => {
            planEl.style.transform = css
          })
        }
        if (done) {
          yield* Effect.sync(() => {
            delete house.dataset['drafting']
          })
        }

        // The pets move in once the house is up, and chase the spot on the
        // floor under the pointer.
        const floor = at === null ? null : unproject(view, at)
        const home = yield* Ref.get(pets)
        const moved =
          lift < 1
            ? null
            : home === null
              ? still
                ? restingPets(current)
                : initialPets(current, Math.floor(now))
              : stepPets(home, { now, plan: current, pointer: floor, still })
        yield* Ref.set(pets, moved)
        // Down into a play bow: someone's playing with Teddy.
        if (moved !== null && moved.teddy.alert && !(home?.teddy.alert ?? false)) yield* played

        yield* render(gpu, canvas, {
          plan: current,
          draft: draftOf({ since, still }),
          pets: moved,
          view,
          lift,
          now,
        })

        // Once it's up, a still house or one off screen can rest.
        if (lift >= 1 && (still || !(yield* Ref.get(visible)))) return
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
        visibility(house).pipe(Stream.map(next => Input.Shown({ visible: next }))),
        pointed(canvas, house),
        resizes([house, planEl]).pipe(Stream.as(Input.Moved())),
        Stream.fromEventListener(window, 'resize').pipe(Stream.as(Input.Moved())),
        // Web fonts landing can reflow every room.
        fontsReady.pipe(Stream.as(Input.Moved())),
      ],
      { concurrency: 'unbounded' },
    )

    const { wake } = yield* wakeToDraw(animate)
    yield* wakeOn({ stream: inputs, wake, handle })
    yield* wakeOn({ stream: changes, wake, handle: next => Ref.set(settings, next) })

    yield* markHouse(house, planEl, gpu.device)
    yield* wake
  })
