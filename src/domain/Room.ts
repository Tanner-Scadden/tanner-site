import { Schema } from 'effect'

// NOTE: the Manor's rooms. The parlour is its front room, at /manor itself.
export const RoomId = Schema.Literals(['parlour', 'trophy', 'workshop'])
export type RoomId = typeof RoomId.Type

export const ROOMS = RoomId.literals
