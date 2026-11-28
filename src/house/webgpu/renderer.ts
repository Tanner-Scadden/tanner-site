import { Array as Arr, Boolean as Bool, Data, Effect, Option, Ref, type Scope, Stream } from 'effect'

import { fitCanvas } from '../../gpu/canvas.ts'
import { type GpuUnavailable, acquireBuffer, acquireGpu, markDrawing } from '../../gpu/device.ts'
import { nextFrame, stepSince, wakeOn, wakeToDraw } from '../../gpu/loop.ts'
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
  type Rect,
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
const MAX_DOTS = PRINTS * 2 * 5
const MAX_SPRITES = 2
const MAX_BARKS = 3
const DEPTH_FORMAT: GPUTextureFormat = 'depth24plus'

const NO_RECT: Rect = { x: 0, y: 0, w: 0, h: 0 }

const rectOf = (el: Element, origin: DOMRect): Rect => {
  const r = el.getBoundingClientRect()
  return { x: r.left - origin.left, y: r.top - origin.top, w: r.width, h: r.height }
}

const flag = (on: boolean): number => {
  if (on) return 1
  return 0
}

const measure = (canvas: HTMLCanvasElement, plan: HTMLElement): Plan => {
  const transform = plan.style.transform
  plan.style.transform = ''
  const origin = canvas.getBoundingClientRect()
  const room = (name: string): Rect =>
    Option.match(Option.fromNullishOr(plan.querySelector(`[data-room="${name}"]`)), {
      onNone: () => NO_RECT,
      onSome: el => rectOf(el, origin),
    })
  const measured = planFor({
    house: rectOf(plan, origin),
    library: room('library'),
    work: room('work'),
    oss: room('oss'),
    outside: room('outside'),
    locked: room('locked'),
  })
  plan.style.transform = transform
  return measured
}

interface Depth {
  texture: Option.Option<GPUTexture>
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

    const sheet = yield* Effect.acquireRelease(
      Effect.sync(() => {
        const levels = Array.from({ length: SHEET_LEVELS }, (_, level) => drawSheet(level))
        const texture = device.createTexture({
          size: Option.match(Arr.head(levels), {
            onNone: () => [1, 1],
            onSome: top => [top.width, top.height],
          }),
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

    const depth = yield* Effect.acquireRelease(
      Effect.sync((): Depth => ({ texture: Option.none() })),
      d =>
        Effect.sync(() => {
          if (Option.isSome(d.texture)) d.texture.value.destroy()
        }),
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
  if (Option.isSome(current)) {
    if (current.value.width === canvas.width && current.value.height === canvas.height) {
      return current.value.createView()
    }
    current.value.destroy()
  }
  const texture = gpu.device.createTexture({
    size: [canvas.width, canvas.height],
    format: DEPTH_FORMAT,
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  })
  gpu.depth.texture = Option.some(texture)
  return texture.createView()
}

const pawSize = (gold: number): number => {
  if (gold === 1) return 1.3
  return 1.1
}

const pawDots = (
  print: Print,
  gold: number,
  now: number,
  view: View,
): ReadonlyArray<ReadonlyArray<number>> => {
  const alpha = printAlpha(print, now) * 0.8
  if (alpha <= 0) return []
  const { at, heading: h } = print
  const size = pawSize(gold)
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

const petWidth = (plan: Plan): number => Math.min(50, Math.max(30, (plan.inside.w + 16) / 10))

interface Placed {
  readonly left: number
  readonly top: number
  readonly w: number
  readonly h: number
  readonly depth: number
}

const petScale = (pet: Pet): number => {
  if (pet.name === 'rain') return 0.92
  return 1
}

const rowOf = (pet: Pet): number => {
  if (pet.name === 'teddy') return TEDDY_ROW
  return RAIN_ROW
}

const place = (pet: Pet, plan: Plan, view: View): Placed => {
  const feet = project(view, { x: pet.at.x, y: pet.at.y, z: 0 })
  const w = petWidth(plan) * petScale(pet) * feet.scale
  const h = (w * CELL_H) / CELL_W
  const ground = (44 / CELL_H) * h
  return { left: feet.x - w / 2, top: feet.y - ground, w, h, depth: Math.max(0, feet.depth - 0.002) }
}

const spriteFor = (pet: Pet, at: Placed): ReadonlyArray<number> => [
  at.left,
  at.top,
  at.w,
  at.h,
  frameOf(pet),
  rowOf(pet),
  flag(pet.facing < 0),
  1,
  at.depth,
  0,
  0,
  0,
]

const facingSign = (pet: Pet): number => {
  if (pet.facing < 0) return -1
  return 1
}

const mouthXFor = (facing: number): number => {
  if (facing > 0) return BARK_FROM[0]
  return CELL_W - BARK_FROM[0]
}

const barkLines = (pet: Pet, at: Placed, t: number): ReadonlyArray<ReadonlyArray<number>> => {
  const unit = at.w / CELL_W
  const facing = facingSign(pet)
  const mouthX = mouthXFor(facing)
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
  readonly pets: Option.Option<Pets>
  readonly view: View
  readonly lift: number
  readonly now: number
}

interface Counts {
  readonly dots: number
  readonly sprites: number
  readonly barks: number
}

const NO_PETS: Counts = { dots: 0, sprites: 0, barks: 0 }

const fillPrints = (gpu: Gpu, pets: Pets, view: View, now: number): number => {
  let dots = 0
  for (const pet of [pets.rain, pets.teddy]) {
    const gold = flag(pet.name === 'teddy')
    for (const print of pet.prints) {
      for (const dot of pawDots(print, gold, now, view)) {
        if (dots < MAX_DOTS) gpu.dotData.set(dot, dots++ * DOT_FLOATS)
      }
    }
  }
  return dots
}

const fillPets = (gpu: Gpu, plan: Plan, pets: Pets, view: View, now: number): Counts => {
  const dots = fillPrints(gpu, pets, view, now)
  let sprites = 0
  let barks = 0
  const placed = [pets.rain, pets.teddy]
    .map(pet => ({ pet, at: place(pet, plan, view) }))
    .sort((a, b) => b.at.depth - a.at.depth)
  for (const { pet, at } of placed) {
    if (sprites < MAX_SPRITES) gpu.spriteData.set(spriteFor(pet, at), sprites++ * SPRITE_FLOATS)
    const bark = Option.filter(barkOf(pet, now), () => pet.name === 'teddy')
    if (Option.isSome(bark)) {
      for (const line of barkLines(pet, at, bark.value)) {
        if (barks < MAX_BARKS) gpu.barkData.set(line, barks++ * WALL_FLOATS)
      }
    }
  }
  return { dots, sprites, barks }
}

const fillWalls = (gpu: Gpu, plan: Plan, draft: Draft): number => {
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
  return walls
}

const fillRooms = (gpu: Gpu, plan: Plan, draft: Draft) =>
  ROOM_ORDER.forEach((name, i) => {
    const r = plan.rooms[name]
    gpu.roomData.set(
      [r.x, r.y, r.w, r.h, flag(name === 'locked'), Option.getOrElse(Arr.get(draft.rooms, i), () => 0), 0, 0],
      i * ROOM_FLOATS,
    )
  })

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
    const walls = fillWalls(gpu, plan, draft)
    fillRooms(gpu, plan, draft)
    const { dots, sprites, barks } = Option.match(pets, {
      onNone: () => NO_PETS,
      onSome: home => fillPets(gpu, plan, home, view, now),
    })
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


type Input = Data.TaggedEnum<{
  Shown: { readonly visible: boolean }
  Pointed: { readonly pointer: Option.Option<Point> }
  Moved: {}
}>
const Input = Data.taggedEnum<Input>()

const pointed = (canvas: HTMLCanvasElement, house: HTMLElement): Stream.Stream<Input> => {
  const at = (event: PointerEvent): Input => {
    const origin = canvas.getBoundingClientRect()
    return Input.Pointed({
      pointer: Option.some({ x: event.clientX - origin.left, y: event.clientY - origin.top }),
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
        Stream.as(Input.Pointed({ pointer: Option.none() })),
      ),
    ],
    { concurrency: 'unbounded' },
  )
}


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

interface Frame {
  readonly now: number
  readonly still: boolean
  readonly current: Plan
}

interface Lean {
  readonly still: boolean
  readonly lift: number
  readonly at: Option.Option<Point>
  readonly outline: Rect
}

const leaningOf = ({ still, lift, at, outline }: Lean): Tilt => {
  if (still || lift < 1) return LEVEL
  return tiltToward(at, outline)
}

const cssOf = (view: View, outline: Rect, lift: number): string => {
  if (lift > 0) return cssTransform(view, { x: outline.x, y: outline.y })
  return ''
}

const arrivePets = (current: Plan, now: number, still: boolean): Pets => {
  if (still) return restingPets(current)
  return initialPets(current, Math.floor(now))
}

interface Herd {
  readonly home: Option.Option<Pets>
  readonly floor: Option.Option<Point>
  readonly lift: number
}

const herd = ({ now, still, current }: Frame, { home, floor, lift }: Herd): Option.Option<Pets> => {
  if (lift < 1) return Option.none()
  return Option.some(
    Option.match(home, {
      onNone: () => arrivePets(current, now, still),
      onSome: pets => stepPets(pets, { now, plan: current, pointer: floor, still }),
    }),
  )
}

const startsPlaying = (moved: Option.Option<Pets>, home: Option.Option<Pets>): boolean =>
  Option.exists(moved, pets => pets.teddy.alert) && !Option.exists(home, pets => pets.teddy.alert)

const findPlan = (canvas: HTMLCanvasElement) =>
  Option.flatMap(Option.fromNullishOr(canvas.parentElement), house =>
    Option.map(Option.fromNullishOr(house.querySelector<HTMLElement>('[data-plan]')), planEl => ({
      house,
      planEl,
    })),
  )

export const runHouseDrawing = (
  canvas: HTMLCanvasElement,
  initial: HouseSettings,
  changes: Stream.Stream<HouseSettings>,
  played: Effect.Effect<void>,
): Effect.Effect<void, GpuUnavailable, Scope.Scope> =>
  Option.match(findPlan(canvas), {
    onNone: () => Effect.void,
    onSome: ({ house, planEl }) => drawHouse({ canvas, house, planEl, initial, changes, played }),
  })

interface Drawing {
  readonly canvas: HTMLCanvasElement
  readonly house: HTMLElement
  readonly planEl: HTMLElement
  readonly initial: HouseSettings
  readonly changes: Stream.Stream<HouseSettings>
  readonly played: Effect.Effect<void>
}

const drawHouse = ({ canvas, house, planEl, initial, changes, played }: Drawing) =>
  Effect.gen(function* () {
    const gpu = yield* makeGpu(canvas)

    const settings = yield* Ref.make(initial)
    const plan = yield* Ref.make(measure(canvas, planEl))
    const pointer = yield* Ref.make<Option.Option<Point>>(Option.none())
    const visible = yield* Ref.make(true)
    const draftStart = yield* Ref.make<Option.Option<number>>(Option.none())
    const pets = yield* Ref.make<Option.Option<Pets>>(Option.none())
    const tilt = yield* Ref.make<Tilt>(LEVEL)
    const last = yield* Ref.make<Option.Option<number>>(Option.none())
    const transform = yield* Ref.make('')

    const frame = Effect.fn('House.frame')(function* ({ now, still, current }: Frame) {
      const { house: outline } = current.rooms
      const started = yield* Ref.updateAndGet(draftStart, s => Option.orElse(s, () => Option.some(now)))
      const start = Option.getOrElse(started, () => now)
      const since = now - start
      const done = drafted({ since, still })
      const lift = liftOf({ since, still })
      const before = yield* Ref.getAndSet(last, Option.some(now))
      const dt = stepSince({ before, now })

      const at = yield* Ref.get(pointer)
      const leaning = leaningOf({ still, lift, at, outline })
      const leaned = yield* Ref.updateAndGet(tilt, t =>
        Bool.match(still, { onTrue: () => LEVEL, onFalse: () => followTilt(t, { to: leaning, dt }) }),
      )
      const view = viewOf(outline, { tilt: leaned, lift, fit: fitFor(outline) })

      const css = cssOf(view, outline, lift)
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

      const floor = Option.flatMap(at, p => unproject(view, p))
      const home = yield* Ref.get(pets)
      const moved = herd({ now, still, current }, { home, floor, lift })
      yield* Ref.set(pets, moved)
      if (startsPlaying(moved, home)) yield* played

      yield* render(gpu, canvas, {
        plan: current,
        draft: draftOf({ since, still }),
        pets: moved,
        view,
        lift,
        now,
      })
      return lift
    })

    const animate = Effect.gen(function* () {
      yield* Ref.update(pets, Option.map(wakePets))
      yield* Ref.set(last, Option.none())
      while (true) {
        const now = yield* nextFrame
        const { still } = yield* Ref.get(settings)
        const current = yield* Ref.get(plan)
        const lift = yield* frame({ now, still, current })
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
          yield* Ref.set(pointer, Option.none())
          yield* Ref.update(pets, Option.map(p => movePets(p, { from: before, to: after })))
        }),
    })

    const inputs = Stream.mergeAll(
      [
        visibility(house).pipe(Stream.map(next => Input.Shown({ visible: next }))),
        pointed(canvas, house),
        resizes([house, planEl]).pipe(Stream.as(Input.Moved())),
        Stream.fromEventListener(window, 'resize').pipe(Stream.as(Input.Moved())),
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
