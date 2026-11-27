import { Schema } from 'effect'

export const EggId = Schema.Literals([
  'manor',
  'worlds',
  'thesis',
  'konami',
  'console',
  'print',
  'gpu',
  'teddy',
])
export type EggId = typeof EggId.Type

export const EGG_COUNT = EggId.literals.length
