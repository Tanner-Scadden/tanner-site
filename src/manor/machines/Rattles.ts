import { Context, Effect, Layer, Match, Schema, Stream, String as Str } from 'effect'
import { Event, Machine, State } from 'effect-machine'

import { RATTLES_SAYS, RATTLES_UPSET } from '#content/manor'
import { RoomId } from '#domain/Room'

import { type Actor, started } from '../../lib/actor.ts'
import type { SiteRoute } from '../../routes.ts'
import { Page, type PageState, pageOf } from '../../site/machines/Page.ts'

const TYPE_MS = 18
const CHARS_PER_TICK = 2
export const CUT_OFF_LIMIT = 3
export const UPSET_MS = 3200

export const RattlesState = State({
  Away: {},
  Typing: { room: RoomId, shown: Schema.Finite, cutOffs: Schema.Finite },
  Said: { room: RoomId },
  Upset: { room: RoomId },
})
export type RattlesState = typeof RattlesState.Type

export const RattlesEvent = Event({
  Entered: { room: RoomId },
  Left: {},
  Ticked: {},
  Calmed: {},
})
export type RattlesEvent = typeof RattlesEvent.Type

const startLine = (room: RoomId, cutOffs: number, reducedMotion: boolean): RattlesState => {
  if (reducedMotion) return RattlesState.Said({ room })
  return RattlesState.Typing({ room, shown: 0, cutOffs })
}

interface Line {
  readonly room: RoomId
  readonly shown: number
  readonly cutOffs: number
}

const cutOff = <T extends Line>(
  typing: T,
  room: RoomId,
  reducedMotion: boolean,
): T | RattlesState => {
  if (typing.room === room) return typing
  if (typing.cutOffs + 1 >= CUT_OFF_LIMIT) return RattlesState.Upset({ room })
  return startLine(room, typing.cutOffs + 1, reducedMotion)
}

const typed = ({ room, shown, cutOffs }: Line): RattlesState => {
  if (shown + CHARS_PER_TICK >= RATTLES_SAYS[room].length) return RattlesState.Said({ room })
  return RattlesState.Typing({ room, shown: shown + CHARS_PER_TICK, cutOffs })
}

const rattlesEventOf = (page: PageState): RattlesEvent => {
  if (page._tag === 'Manor') return RattlesEvent.Entered({ room: page.room })
  return RattlesEvent.Left
}

export const rattlesOf = ({
  reducedMotion,
  route,
}: {
  readonly reducedMotion: boolean
  readonly route: SiteRoute
}): RattlesState => {
  const page = pageOf(route)
  if (page._tag === 'Manor') return startLine(page.room, 0, reducedMotion)
  return RattlesState.Away
}

export const rattlesMachine = (reducedMotion: boolean) =>
  Machine.make({
    state: RattlesState,
    event: RattlesEvent,
    initial: (input: { readonly route: SiteRoute }) =>
      rattlesOf({ reducedMotion, route: input.route }),
  })
    .onAny(RattlesEvent.Entered, ({ state, event }) =>
      Match.valueTags(state, {
        Away: () => startLine(event.room, 0, reducedMotion),
        Said: said => {
          if (said.room === event.room) return said
          return startLine(event.room, 0, reducedMotion)
        },
        Typing: typing => cutOff(typing, event.room, reducedMotion),
        Upset: () => RattlesState.Upset({ room: event.room }),
      }),
    )
    .onAny(RattlesEvent.Left, () => RattlesState.Away)
    .on(RattlesState.Typing, RattlesEvent.Ticked, ({ state }) => typed(state))
    .spawn(
      RattlesState.Typing,
      ({ self }) =>
        Effect.forever(
          Effect.andThen(Effect.sleep(TYPE_MS), self.send(RattlesEvent.Ticked)),
        ),
      { name: 'typeLine' },
    )
    .timeout(RattlesState.Upset, {
      duration: () => UPSET_MS,
      event: RattlesEvent.Calmed,
    })
    .on(RattlesState.Upset, RattlesEvent.Calmed, ({ state }) =>
      startLine(state.room, 0, reducedMotion),
    )
    .background(function followPage({ self }) {
      return Effect.gen(function* () {
        const page = yield* Page
        yield* Stream.runForEach(page.changes, state => self.send(rattlesEventOf(state)))
      })
    })

export const rattlesSays = (state: RattlesState): string =>
  RattlesState.$match(state, {
    Away: () => '',
    Typing: ({ room, shown }) => `${Str.slice(0, shown)(RATTLES_SAYS[room])}▌`,
    Said: ({ room }) => RATTLES_SAYS[room],
    Upset: () => RATTLES_UPSET,
  })

export class Rattles extends Context.Service<
  Rattles,
  Actor<RattlesState, RattlesEvent>
>()('tanner-site/manor/machines/Rattles') {
  static readonly layer = ({
    reducedMotion,
    route,
  }: {
    readonly reducedMotion: boolean
    readonly route: SiteRoute
  }) =>
    Layer.effect(
      this,
      started(Machine.spawn(rattlesMachine(reducedMotion), { input: { route } })),
    )
}
