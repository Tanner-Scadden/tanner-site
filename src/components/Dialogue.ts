import { Component, Subscription, UiSchema } from '@effect/ui'
import { Html } from '@effect/ui/html'
import { Context, Effect, Layer, Schema, Stream } from 'effect'
import { Machine } from 'effect-machine'

import { RATTLES_SAYS, ROOMS } from '../content'
import { type Actor, started } from '../machines/actor'
import {
  DialogueEvent,
  DialogueState,
  dialogueMachine,
  shownOf,
} from '../machines/Dialogue'
import { SPRITE_SIZE, spriteShadow } from '../sprites'

const DialogueProps = Schema.Struct({
  room: Schema.Literals(ROOMS),
  reducedMotion: Schema.Boolean,
})
type DialogueProps = typeof DialogueProps.Type

const machineFor = (props: DialogueProps) =>
  dialogueMachine({
    line: RATTLES_SAYS[props.room],
    reducedMotion: props.reducedMotion,
  })

// NOTE: Rattles types each room's line once per visit. The parent keys this
// component by room, so a new room mounts a new actor.
export class DialogueActor extends Context.Service<
  DialogueActor,
  Actor<DialogueState, DialogueEvent>
>()('tanner-site/components/Dialogue/DialogueActor') {
  static readonly layer = (props: DialogueProps) =>
    Layer.effect(this, started(Machine.spawn(machineFor(props))))
}

const DialogueMessage = UiSchema.TaggedEnum({
  ChangedLine: { state: DialogueState },
})

const DialogueDef = Html.component({
  name: 'Dialogue',
  props: DialogueProps,
  model: DialogueState,
  message: DialogueMessage,
})

const RATTLES_PX = 5.5

export const DialogueNoDeps = DialogueDef.make({
  init: $ => machineFor($.props).initial,
  update: {
    ChangedLine: (_, { state }) => state,
  },
  subscriptions: () => [
    Subscription.make(
      'line',
      Stream.unwrap(
        DialogueActor.use(actor => Effect.succeed(actor.changes)),
      ).pipe(Stream.map(state => DialogueMessage.ChangedLine({ state }))),
    ),
  ],
  view: (h, state) =>
    h.div
      .class('dlg')
      .children(
        h.span
          .class('sprite')
          .attr('aria-hidden', 'true')
          .style({
            width: `${SPRITE_SIZE * RATTLES_PX}px`,
            height: `${SPRITE_SIZE * RATTLES_PX}px`,
          })
          .children(
            h.span.class('px').style({
              width: `${RATTLES_PX}px`,
              height: `${RATTLES_PX}px`,
              boxShadow: spriteShadow({ name: 'rattles', pixel: RATTLES_PX }),
            }),
          ),
        h.div(
          h.div.class('who').children('RATTLES'),
          h.div
            .class('txt')
            .attr('aria-live', 'polite')
            .children(shownOf({ line: RATTLES_SAYS[h.props.room], state })),
        ),
      ),
})

export const Dialogue = DialogueNoDeps.pipe(
  Component.provide((props: DialogueProps) => DialogueActor.layer(props)),
)
