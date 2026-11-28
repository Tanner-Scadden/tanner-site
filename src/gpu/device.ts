import { Effect, Schema } from 'effect'

// Getting a GPU to draw with, for every drawing on the site. Each piece is
// scoped, so closing a drawing's scope hands everything back.

export class GpuUnavailable extends Schema.TaggedError<GpuUnavailable, { readonly brand: unique symbol }>()(
  'GpuUnavailable',
  { reason: Schema.Literals(['no-webgpu', 'no-adapter', 'no-device', 'no-context']) },
) {}

export const unavailable = (reason: typeof GpuUnavailable.fields.reason.Type) => GpuUnavailable.make({ reason })

export const requestAdapter = Effect.gen(function* () {
  if (!('gpu' in navigator)) return yield* unavailable('no-webgpu')
  const adapter = yield* Effect.promise(() => navigator.gpu.requestAdapter({ powerPreference: 'low-power' }))
  return adapter ?? (yield* unavailable('no-adapter'))
})

export const acquireDevice = (adapter: GPUAdapter) =>
  Effect.acquireRelease(
    Effect.tryPromise({ try: () => adapter.requestDevice(), catch: () => unavailable('no-device') }),
    device => Effect.sync(() => device.destroy()),
  )

export const acquireContext = (
  canvas: HTMLCanvasElement,
  device: GPUDevice,
  alphaMode: GPUCanvasAlphaMode = 'opaque',
) =>
  Effect.acquireRelease(
    Effect.gen(function* () {
      const context = canvas.getContext('webgpu')
      if (context === null) return yield* unavailable('no-context')
      const format = navigator.gpu.getPreferredCanvasFormat()
      context.configure({ device, format, alphaMode })
      return { context, format }
    }),
    ({ context }) => Effect.sync(() => context.unconfigure()),
  )

export const acquireBuffer = (device: GPUDevice, descriptor: GPUBufferDescriptor) =>
  Effect.acquireRelease(
    Effect.sync(() => device.createBuffer(descriptor)),
    buffer => Effect.sync(() => buffer.destroy()),
  )

// An adapter, its device and a context on `canvas`: what every drawing
// starts with.
export const acquireGpu = (canvas: HTMLCanvasElement, alphaMode: GPUCanvasAlphaMode = 'opaque') =>
  Effect.gen(function* () {
    const adapter = yield* requestAdapter
    const device = yield* acquireDevice(adapter)
    const { context, format } = yield* acquireContext(canvas, device, alphaMode)
    return { adapter, device, context, format }
  })

// Runs `then` if the device is lost while the scope is open, so the page
// can fall back to what it shows without the GPU.
export const whenLost = (device: GPUDevice, then: Effect.Effect<void>) =>
  Effect.forkScoped(Effect.andThen(Effect.promise(() => device.lost), then))

// Sets `data-gpu="on"` on `element` while the scope is open, so CSS and
// tests can tell the GPU is drawing it, and `"lost"` if the device goes.
// `lost` and `released` put back anything else the drawing changed on the
// page, when the device goes and when the scope closes.
export interface Marking {
  readonly element: HTMLElement
  readonly device: GPUDevice
  readonly lost?: Effect.Effect<void>
  readonly released?: Effect.Effect<void>
}

export const markDrawing = ({ element, device, lost = Effect.void, released = Effect.void }: Marking) =>
  Effect.gen(function* () {
    yield* whenLost(
      device,
      Effect.sync(() => {
        element.dataset['gpu'] = 'lost'
      }).pipe(Effect.andThen(lost)),
    )
    yield* Effect.acquireRelease(
      Effect.sync(() => {
        element.dataset['gpu'] = 'on'
      }),
      () =>
        Effect.sync(() => {
          delete element.dataset['gpu']
        }).pipe(Effect.andThen(released)),
    )
  })
