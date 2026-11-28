import { Array as Arr } from 'effect'

// Building pipelines and their bindings, for every drawing on the site.

// Blending for colours that come out of the shader already multiplied by
// their alpha, which is what every drawing here uses.
export const PREMULTIPLIED: GPUBlendState = {
  color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
  alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
}

// A whole buffer, as a binding.
export const whole = (buffer: GPUBuffer): GPUBindingResource => ({ buffer })

// `pipeline` with its group 0 bound to `resources`, in binding order.
export const bound = <P extends GPURenderPipeline | GPUComputePipeline>({
  device,
  pipeline,
  resources,
}: {
  readonly device: GPUDevice
  readonly pipeline: P
  readonly resources: ReadonlyArray<GPUBindingResource>
}) => ({
  pipeline,
  group: device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: Arr.map(resources, (resource, binding) => ({ binding, resource })),
  }),
})

export interface Pass {
  readonly device: GPUDevice
  readonly format: GPUTextureFormat
  readonly code: string
  // The fragment entry point; the vertex one is always `vs`.
  readonly fragment?: string
  readonly blend?: GPUBlendState
  readonly writeMask?: number
  readonly depth?: GPUDepthStencilState
}

// A render pipeline drawing triangle lists from one WGSL module, with `vs`
// as its vertex entry point.
export const renderPipeline = ({
  device,
  format,
  code,
  fragment = 'fs',
  blend = PREMULTIPLIED,
  writeMask = GPUColorWrite.ALL,
  depth,
}: Pass): GPURenderPipeline => {
  const module = device.createShaderModule({ code })
  return device.createRenderPipeline({
    layout: 'auto',
    vertex: { module, entryPoint: 'vs' },
    fragment: { module, entryPoint: fragment, targets: [{ format, blend, writeMask }] },
    primitive: { topology: 'triangle-list' },
    ...(depth === undefined ? {} : { depthStencil: depth }),
  })
}
