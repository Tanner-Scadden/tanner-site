import { Effect } from 'effect'

import { acquireBuffer, acquireGpu, unavailable } from '../../../gpu/device.ts'
import { bound, renderPipeline, whole } from '../../../gpu/pipeline.ts'
import type { Rgba, Shapes } from '../scene.ts'
import { DOTS, DOT_FLOATS, LINES, LINE_FLOATS } from './shaders.ts'

export interface Painter {
  readonly paint: (shapes: Shapes, width: number, height: number, opacity: number) => void
}

const VIEW_FLOATS = 4

const gpuPainter = (canvas: HTMLCanvasElement, maxLines: number, maxDots: number) =>
  Effect.gen(function* () {
    const { device, context, format } = yield* acquireGpu(canvas, 'premultiplied')

    const viewBuffer = yield* acquireBuffer(device, {
      size: VIEW_FLOATS * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    })
    const lineBuffer = yield* acquireBuffer(device, {
      size: maxLines * LINE_FLOATS * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    })
    const dotBuffer = yield* acquireBuffer(device, {
      size: maxDots * DOT_FLOATS * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    })

    const pipelineOf = (code: string, buffer: GPUBuffer) =>
      bound({
        device,
        pipeline: renderPipeline({ device, format, code }),
        resources: [whole(viewBuffer), whole(buffer)],
      })
    const lines = pipelineOf(LINES, lineBuffer)
    const dots = pipelineOf(DOTS, dotBuffer)

    const viewData = new Float32Array(VIEW_FLOATS)
    const lineData = new Float32Array(maxLines * LINE_FLOATS)
    const dotData = new Float32Array(maxDots * DOT_FLOATS)

    const painter: Painter = {
      paint: (shapes, width, height, opacity) => {
        viewData.set([width, height, opacity, 0])
        device.queue.writeBuffer(viewBuffer, 0, viewData)

        const lineCount = Math.min(shapes.lines.length, maxLines)
        for (let i = 0; i < lineCount; i++) {
          const line = shapes.lines[i]!
          lineData.set(
            [line.from[0], line.from[1], line.to[0], line.to[1], ...line.color, line.width, 0, 0, 0],
            i * LINE_FLOATS,
          )
        }
        if (lineCount > 0) device.queue.writeBuffer(lineBuffer, 0, lineData, 0, lineCount * LINE_FLOATS)

        const dotCount = Math.min(shapes.dots.length, maxDots)
        for (let i = 0; i < dotCount; i++) {
          const dot = shapes.dots[i]!
          dotData.set([dot.x, dot.y, dot.radius, dot.glow, ...dot.color, dot.ring, 0, 0, 0], i * DOT_FLOATS)
        }
        if (dotCount > 0) device.queue.writeBuffer(dotBuffer, 0, dotData, 0, dotCount * DOT_FLOATS)

        const encoder = device.createCommandEncoder()
        const pass = encoder.beginRenderPass({
          colorAttachments: [
            {
              view: context.getCurrentTexture().createView(),
              clearValue: { r: 0, g: 0, b: 0, a: 0 },
              loadOp: 'clear',
              storeOp: 'store',
            },
          ],
        })
        if (lineCount > 0) {
          pass.setPipeline(lines.pipeline)
          pass.setBindGroup(0, lines.group)
          pass.draw(6, lineCount)
        }
        if (dotCount > 0) {
          pass.setPipeline(dots.pipeline)
          pass.setBindGroup(0, dots.group)
          pass.draw(6, dotCount)
        }
        pass.end()
        device.queue.submit([encoder.finish()])
      },
    }
    return painter
  })

const css = ([r, g, b, a]: Rgba): string =>
  `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a})`

const canvasPainter = (canvas: HTMLCanvasElement) =>
  Effect.gen(function* () {
    const context = canvas.getContext('2d')
    if (context === null) return yield* unavailable('no-context')
    const painter: Painter = {
      paint: (shapes, width, height, opacity) => {
        const ratio = canvas.width / Math.max(1, width)
        context.setTransform(ratio, 0, 0, ratio, 0, 0)
        context.clearRect(0, 0, width, height)
        context.globalAlpha = opacity
        context.lineCap = 'round'
        for (const line of shapes.lines) {
          context.strokeStyle = css(line.color)
          context.lineWidth = line.width
          context.beginPath()
          context.moveTo(line.from[0], line.from[1])
          context.lineTo(line.to[0], line.to[1])
          context.stroke()
        }
        for (const dot of shapes.dots) {
          if (dot.ring > 0) {
            context.strokeStyle = css(dot.color)
            context.lineWidth = dot.ring
            context.beginPath()
            context.arc(dot.x, dot.y, dot.radius, 0, Math.PI * 2)
            context.stroke()
            continue
          }
          if (dot.glow > 0) {
            const halo = context.createRadialGradient(dot.x, dot.y, dot.radius, dot.x, dot.y, dot.radius + dot.glow)
            halo.addColorStop(0, css([dot.color[0], dot.color[1], dot.color[2], dot.color[3] * 0.35]))
            halo.addColorStop(1, css([dot.color[0], dot.color[1], dot.color[2], 0]))
            context.fillStyle = halo
            context.beginPath()
            context.arc(dot.x, dot.y, dot.radius + dot.glow, 0, Math.PI * 2)
            context.fill()
          }
          context.fillStyle = css(dot.color)
          context.beginPath()
          context.arc(dot.x, dot.y, Math.max(0, dot.radius), 0, Math.PI * 2)
          context.fill()
        }
      },
    }
    return painter
  })

// WebGPU, or the 2D canvas when the browser has none. A device or context
// that fails after the canvas was claimed for WebGPU can't fall back, since
// a canvas only ever gets one kind of context.
export const painterFor = (canvas: HTMLCanvasElement, maxLines: number, maxDots: number) =>
  gpuPainter(canvas, maxLines, maxDots).pipe(
    Effect.catchTag('GpuUnavailable', error =>
      error.reason === 'no-webgpu' || error.reason === 'no-adapter'
        ? canvasPainter(canvas)
        : Effect.fail(error),
    ),
  )
