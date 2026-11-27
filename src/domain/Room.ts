import { Schema } from 'effect'

export const RoomId = Schema.Literals(['parlour', 'trophy', 'workshop'])
export type RoomId = typeof RoomId.Type

export const ROOMS = RoomId.literals
