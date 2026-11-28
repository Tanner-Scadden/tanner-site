import { Effect, Option, Schema } from 'effect'


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
      const found = Option.fromNullishOr(canvas.getContext('webgpu'))
      if (Option.isNone(found)) return yield* unavailable('no-context')
      const context = found.value
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

export const acquireGpu = (canvas: HTMLCanvasElement, alphaMode: GPUCanvasAlphaMode = 'opaque') =>
  Effect.gen(function* () {
    const adapter = yield* requestAdapter
    const device = yield* acquireDevice(adapter)
    const { context, format } = yield* acquireContext(canvas, device, alphaMode)
    return { adapter, device, context, format }
  })

export const whenLost = (device: GPUDevice, then: Effect.Effect<void>) =>
  Effect.forkScoped(Effect.andThen(Effect.promise(() => device.lost), then))

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
