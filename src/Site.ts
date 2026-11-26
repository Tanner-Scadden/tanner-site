import { Command, Component, Head, Subscription, UiSchema } from '@effect/ui'
import { Html, HtmlHead, HtmlSubscription } from '@effect/ui/html'
import { Effect, Layer, Schema, Stream, String as Str } from 'effect'

import { EggId } from '#domain/Egg'

import { Blueprint } from './blueprint/components/Blueprint.ts'
import { Gpu, GpuEvent } from './blueprint/machines/Gpu.ts'
import { Eggs, EggsEvent } from './eggs/machines/Eggs.ts'
import { beforePrint } from './eggs/subscriptions/beforePrint.ts'
import { devtools } from './eggs/subscriptions/devtools.ts'
import { Zombies } from './horde/components/Zombies.ts'
import { Horde, HordeEvent, zombiesOf } from './horde/machines/Horde.ts'
import { HomePage } from './pages/HomePage.ts'
import { ManorPage } from './pages/manor/ManorPage.ts'
import { NotFoundPage } from './pages/NotFoundPage.ts'
import { RestPage } from './pages/rest/RestPage.ts'
import { SiteRoute } from './routes.ts'
import { SiteSnapshot, initialSnapshot, siteActors, siteSnapshots } from './site/actors.ts'
import { Keys, KeysEvent } from './site/machines/Keys.ts'
import { PageState } from './site/machines/Page.ts'
import { Thesis, ThesisEvent, thesisText } from './thesis/machines/Thesis.ts'
import { Dock, Toast } from './toast/components/Toast.ts'

// What the page reports: everything the user did, handed to the actors as is.
const siteInputs = {
  ClickedThesis: {},
  ClickedWebGpu: {},
  StartedGpu: { supported: Schema.Boolean },
  ClickedZombie: { id: Schema.Finite },
  PressedKey: { key: Schema.String },
  CalledHello: {},
  StartedPrint: {},
}
const SiteInput = UiSchema.TaggedEnum(siteInputs)
type SiteInput = typeof SiteInput.Type

export const SiteMessage = UiSchema.TaggedEnum({
  ...siteInputs,
  ChangedActors: { snapshot: SiteSnapshot },
})
export type SiteMessage = typeof SiteMessage.Type

export class Dispatch extends Command.Service<Dispatch>()('site/Dispatch', {
  args: { input: SiteInput },
  success: Component.Noop,
}) {
  static readonly layer = this.toLayer(
    Effect.gen(function* () {
      const eggs = yield* Eggs
      const thesis = yield* Thesis
      const gpu = yield* Gpu
      const horde = yield* Horde
      const keys = yield* Keys
      return ({ input }: { readonly input: SiteInput }) =>
        SiteInput.match(input, {
          ClickedThesis: () => thesis.send(ThesisEvent.Clicked),
          ClickedWebGpu: () => gpu.send(GpuEvent.Clicked),
          StartedGpu: ({ supported }) => gpu.send(GpuEvent.Started({ supported })),
          ClickedZombie: ({ id }) => horde.send(HordeEvent.Munched({ id })),
          PressedKey: ({ key }) => keys.send(KeysEvent.Pressed({ key })),
          CalledHello: () => eggs.send(EggsEvent.Found({ egg: 'console' })),
          StartedPrint: () => eggs.send(EggsEvent.Found({ egg: 'print' })),
        }).pipe(Effect.as(Component.noop))
    }),
  )
}

const SiteProps = Schema.Struct({
  found: Schema.Array(EggId),
  reducedMotion: Schema.Boolean,
  route: SiteRoute,
})
type SiteProps = typeof SiteProps.Type

// NOTE: the Model is the actors' snapshot and nothing else. Every message
// but the sync is something the user did, handed to the actors as is.
const SiteDef = Html.component({
  name: 'Site',
  props: SiteProps,
  model: SiteSnapshot,
  message: SiteMessage,
})

const roomColorOf = (page: PageState): { readonly name: string; readonly color: string } =>
  PageState.$match(page, {
    Home: () => BLUEPRINT,
    Manor: () => MANOR,
    Rest: () => REST,
    NotFound: () => BLUEPRINT,
  })

const BLUEPRINT = { name: 'blueprint', color: '#0f3b78' }
const MANOR = { name: 'manor', color: '#141022' }
const REST = { name: 'rest', color: '#07090d' }

const titleOf = (page: PageState): string =>
  PageState.$match(page, {
    Home: () => 'Tanner Scadden',
    Manor: ({ room }) =>
      room === 'parlour'
        ? 'The Manor · Tanner Scadden'
        : `${Str.capitalize(room)} · The Manor · Tanner Scadden`,
    Rest: () => 'Rest · Tanner Scadden',
    NotFound: () => 'Not found · Tanner Scadden',
  })

const page = SiteDef.fragment((h, model: SiteSnapshot) => {
  switch (model.page._tag) {
    case 'Home':
      return HomePage(h, {
        eggs: model.eggs,
        thesis: thesisText(model.thesis),
        clickedThesis: SiteMessage.ClickedThesis(),
        clickedWebGpu: SiteMessage.ClickedWebGpu(),
      })
    case 'Manor':
      return ManorPage(h, {
        room: model.page.room,
        rattles: model.rattles,
        reducedMotion: h.props.reducedMotion,
      })
    case 'Rest':
      return RestPage(h)
    case 'NotFound':
      return NotFoundPage(h)
  }
})

export const SiteNoDeps = SiteDef.make({
  init: $ => initialSnapshot($.props),
  update: ($, message) =>
    message._tag === 'ChangedActors'
      ? message.snapshot
      : $.run(Dispatch.make({ input: message })),
  subscriptions: () => [
    Subscription.make(
      'actors',
      Stream.map(siteSnapshots, snapshot => SiteMessage.ChangedActors({ snapshot })),
    ),
    HtmlSubscription.onDocument('keydown', ({ key, editable, repeat }) =>
      editable || repeat ? undefined : SiteMessage.PressedKey({ key }),
    ),
    devtools(SiteMessage.CalledHello()),
    beforePrint(SiteMessage.StartedPrint()),
  ],
  head: $ => {
    const room = roomColorOf($.model.page)
    return [
      Head.title(titleOf($.model.page)),
      HtmlHead.lang('en'),
      // NOTE: the room's color goes on the document itself, so overscroll,
      // the space under short pages and the mobile toolbar all match it.
      HtmlHead.htmlData('data-room', room.name),
      HtmlHead.meta({ name: 'theme-color', content: room.color }),
    ]
  },
  // NOTE: the blueprint canvas, the horde and the toast sit outside the
  // page, so they carry across pages and the GPU never restarts.
  view: (h, model) =>
    h.div(
      Blueprint(h, {
        gpu: model.gpu,
        still: h.props.reducedMotion,
        started: supported => SiteMessage.StartedGpu({ supported }),
      }),
      page(h, model),
      Zombies(h, zombiesOf(model.horde), id => SiteMessage.ClickedZombie({ id })),
      model.page._tag === 'Home' ? Toast(h, model.toast) : Dock(h, model.toast),
    ),
})

// NOTE: the actors start when the Site mounts, seeded from its props, and
// stop when it unmounts.
export const Site = SiteNoDeps.pipe(
  Component.provide((props: SiteProps) =>
    Layer.provideMerge(Dispatch.layer, siteActors(props)),
  ),
)
