// NOTE: the imperative edge of the site. WebGPU is a stateful, callback
// driven browser API, so this module speaks it directly. The Effect side
// (Blueprint.ts) owns its lifetime: it starts the renderer when the canvas
// mounts, passes it the Model's settings, and destroys it when the canvas goes.

import {
  BACKGROUND,
  PARTICLE_COUNT,
  PARTICLE_FLOATS,
  PENS,
  SIMULATE,
  WORKGROUP,
} from './shaders'

export interface BlueprintSettings {
  readonly flow: boolean
  readonly still: boolean
}

export interface BlueprintRenderer {
  readonly update: (settings: BlueprintSettings) => void
  readonly destroy: () => void
}

const MINOR = 24
const MAJOR = 120
const FRAME_FLOATS = 16
const LONGEST_STEP_S = 0.05
const EASE_PER_S = 3

const approach = (from: number, to: number, dt: number): number => {
  const t = 1 - Math.exp(-EASE_PER_S * dt)
  const next = from + (to - from) * t
  return Math.abs(next - to) < 0.002 ? to : next
}

// The wrap extent is a whole number of major cells larger than the screen,
// so a pen that wraps lands back on a grid line.
const extentFor = (size: number): number =>
  (Math.ceil(size / MAJOR) + 1) * MAJOR

const seedParticles = (width: number, height: number): Float32Array => {
  const data = new Float32Array(PARTICLE_COUNT * PARTICLE_FLOATS)
  const cellsX = width / MINOR
  const cellsY = height / MINOR
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const alongX = Math.random() < 0.5
    const speed = 40 + Math.random() * 110
    const sign = Math.random() < 0.5 ? -1 : 1
    const o = i * PARTICLE_FLOATS
    if (alongX) {
      data[o] = Math.random() * width
      data[o + 1] = Math.floor(Math.random() * cellsY) * MINOR + 0.5
      data[o + 2] = sign * speed
      data[o + 3] = 0
    } else {
      data[o] = Math.floor(Math.random() * cellsX) * MINOR + 0.5
      data[o + 1] = Math.random() * height
      data[o + 2] = 0
      data[o + 3] = sign * speed
    }
  }
  return data
}

export const startBlueprint = async (
  canvas: HTMLCanvasElement,
  initial: BlueprintSettings,
): Promise<BlueprintRenderer | null> => {
  if (!('gpu' in navigator)) return null
  const adapter = await navigator.gpu.requestAdapter({
    powerPreference: 'low-power',
  })
  if (adapter === null) return null
  const device = await adapter.requestDevice()
  const context = canvas.getContext('webgpu')
  if (context === null) {
    device.destroy()
    return null
  }
  const format = navigator.gpu.getPreferredCanvasFormat()
  context.configure({ device, format, alphaMode: 'opaque' })

  const frameBuffer = device.createBuffer({
    size: FRAME_FLOATS * 4,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  })
  const frameData = new Float32Array(FRAME_FLOATS)

  // The pens start somewhere on a large field, so they never need reseeding
  // when the window grows.
  const field = extentFor(Math.max(screen.width, screen.height, 2400))
  const particleBuffer = device.createBuffer({
    size: PARTICLE_COUNT * PARTICLE_FLOATS * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  })
  device.queue.writeBuffer(particleBuffer, 0, seedParticles(field, field))

  const background = device.createShaderModule({ code: BACKGROUND })
  const simulate = device.createShaderModule({ code: SIMULATE })
  const pens = device.createShaderModule({ code: PENS })

  const backgroundPipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module: background, entryPoint: 'vs' },
    fragment: { module: background, entryPoint: 'fs', targets: [{ format }] },
    primitive: { topology: 'triangle-list' },
  })
  const simulatePipeline = device.createComputePipeline({
    layout: 'auto',
    compute: { module: simulate, entryPoint: 'step' },
  })
  const pensPipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module: pens, entryPoint: 'vs' },
    fragment: {
      module: pens,
      entryPoint: 'fs',
      targets: [
        {
          format,
          blend: {
            color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
            alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
          },
        },
      ],
    },
    primitive: { topology: 'triangle-list' },
  })

  const backgroundGroup = device.createBindGroup({
    layout: backgroundPipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: frameBuffer } }],
  })
  const simulateGroup = device.createBindGroup({
    layout: simulatePipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: frameBuffer } },
      { binding: 1, resource: { buffer: particleBuffer } },
    ],
  })
  const pensGroup = device.createBindGroup({
    layout: pensPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: frameBuffer } },
      { binding: 1, resource: { buffer: particleBuffer } },
    ],
  })

  let settings = initial
  let destroyed = false
  let frameId: number | null = null
  let last = performance.now()
  let started = last
  let seed = 0
  let pointer = { x: -9999, y: -9999 }
  let eased = { x: -9999, y: -9999 }
  let pointerInside = false
  let warp = 0
  let flow = initial.flow && initial.still ? 1 : 0
  // The pens freeze where they are when motion is reduced.
  let simulated = false

  const resize = (): boolean => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const width = Math.max(1, Math.round(canvas.clientWidth * dpr))
    const height = Math.max(1, Math.round(canvas.clientHeight * dpr))
    if (canvas.width === width && canvas.height === height) return false
    canvas.width = width
    canvas.height = height
    return true
  }

  const settled = (): boolean => {
    const warpTarget = pointerInside && !settings.still ? 1 : 0
    const flowTarget = settings.flow ? 1 : 0
    const pointerSettled =
      Math.abs(eased.x - pointer.x) < 0.5 && Math.abs(eased.y - pointer.y) < 0.5
    const flowMoving = flow > 0 && !settings.still
    return (
      warp === warpTarget &&
      flow === flowTarget &&
      (pointerSettled || warp === 0) &&
      !flowMoving
    )
  }

  const draw = (now: number) => {
    frameId = null
    if (destroyed) return
    const dt = Math.min((now - last) / 1000, LONGEST_STEP_S)
    last = now
    resize()

    const warpTarget = pointerInside && !settings.still ? 1 : 0
    warp = approach(warp, warpTarget, dt)
    flow = settings.still
      ? settings.flow
        ? 1
        : 0
      : approach(flow, settings.flow ? 1 : 0, dt)
    if (warp === 0 || eased.x < -9000) {
      eased = { ...pointer }
    } else {
      const t = 1 - Math.exp(-14 * dt)
      eased = {
        x: eased.x + (pointer.x - eased.x) * t,
        y: eased.y + (pointer.y - eased.y) * t,
      }
    }

    const viewportW = canvas.clientWidth
    const viewportH = canvas.clientHeight
    seed = (seed + 1) % 1_000_000
    const runPens = flow > 0
    const stepPens = runPens && (!settings.still || !simulated)
    frameData.set([
      viewportW,
      viewportH,
      window.scrollX,
      window.scrollY,
      eased.x,
      eased.y,
      extentFor(viewportW),
      extentFor(viewportH),
      warp,
      flow,
      canvas.width / Math.max(viewportW, 1),
      // A frozen first frame steps a little, so the pens show as dashes.
      settings.still ? 0.001 : dt,
      (now - started) / 1000,
      seed,
      0,
      0,
    ])
    device.queue.writeBuffer(frameBuffer, 0, frameData)

    const encoder = device.createCommandEncoder()
    if (stepPens) {
      const compute = encoder.beginComputePass()
      compute.setPipeline(simulatePipeline)
      compute.setBindGroup(0, simulateGroup)
      compute.dispatchWorkgroups(Math.ceil(PARTICLE_COUNT / WORKGROUP))
      compute.end()
      simulated = true
    }
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: context.getCurrentTexture().createView(),
          loadOp: 'clear',
          storeOp: 'store',
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
        },
      ],
    })
    pass.setPipeline(backgroundPipeline)
    pass.setBindGroup(0, backgroundGroup)
    pass.draw(3)
    if (runPens) {
      pass.setPipeline(pensPipeline)
      pass.setBindGroup(0, pensGroup)
      pass.draw(6, PARTICLE_COUNT)
    }
    pass.end()
    device.queue.submit([encoder.finish()])

    if (!settled()) request()
  }

  // NOTE: frames run only while something moves: the pointer lens easing,
  // the flow fading, or the pens drawing. A still page costs nothing.
  const request = () => {
    if (frameId === null && !destroyed) {
      frameId = requestAnimationFrame(draw)
    }
  }

  const onPointerMove = (event: PointerEvent) => {
    if (event.pointerType !== 'mouse') return
    pointer = { x: event.clientX, y: event.clientY }
    pointerInside = true
    request()
  }
  const onPointerLeave = () => {
    pointerInside = false
    request()
  }
  const onChange = () => request()

  window.addEventListener('pointermove', onPointerMove, { passive: true })
  document.documentElement.addEventListener('pointerleave', onPointerLeave)
  window.addEventListener('scroll', onChange, { passive: true })
  window.addEventListener('resize', onChange)

  device.lost.then(() => {
    if (!destroyed) canvas.dataset['gpu'] = 'lost'
  })

  canvas.dataset['gpu'] = 'on'
  started = performance.now()
  request()

  return {
    update: next => {
      if (next.still !== settings.still) simulated = false
      settings = next
      last = performance.now()
      request()
    },
    destroy: () => {
      destroyed = true
      if (frameId !== null) cancelAnimationFrame(frameId)
      window.removeEventListener('pointermove', onPointerMove)
      document.documentElement.removeEventListener(
        'pointerleave',
        onPointerLeave,
      )
      window.removeEventListener('scroll', onChange)
      window.removeEventListener('resize', onChange)
      delete canvas.dataset['gpu']
      device.destroy()
    },
  }
}
