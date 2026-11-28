import { Array as Arr, Option } from 'effect'


export const PREMULTIPLIED: GPUBlendState = {
  color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
  alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
}

export const whole = (buffer: GPUBuffer): GPUBindingResource => ({ buffer })

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
  readonly fragment?: string
  readonly blend?: GPUBlendState
  readonly writeMask?: number
  readonly depth?: GPUDepthStencilState
}

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
  const descriptor: GPURenderPipelineDescriptor = {
    layout: 'auto',
    vertex: { module, entryPoint: 'vs' },
    fragment: { module, entryPoint: fragment, targets: [{ format, blend, writeMask }] },
    primitive: { topology: 'triangle-list' },
  }
  return device.createRenderPipeline(
    Option.match(Option.fromNullishOr(depth), {
      onNone: () => descriptor,
      onSome: depthStencil => ({ ...descriptor, depthStencil }),
    }),
  )
}
