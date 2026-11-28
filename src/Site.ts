import { Command, Component, Head, Router, Subscription, UiSchema } from '@effect/ui'
import { Html, HtmlHead, HtmlSubscription } from '@effect/ui/html'
import { Boolean as Bool, Effect, Layer, Match, Option, Schema, Stream, String as Str } from 'effect'

import { EggId } from '#domain/Egg'
import type { RoomId } from '#domain/Room'

import { Blueprint } from './blueprint/components/Blueprint.ts'
import { Outbreak } from './blueprint/components/Outbreak.ts'
import { findPost } from './blog/posts.ts'
import { Gpu, GpuEvent } from './blueprint/machines/Gpu.ts'
import { Eggs, EggsEvent } from './eggs/machines/Eggs.ts'
import { beforePrint } from './eggs/subscriptions/beforePrint.ts'
import { devtools } from './eggs/subscriptions/devtools.ts'
import { Zombies } from './horde/components/Zombies.ts'
import { Horde, HordeEvent, zombiesOf } from './horde/machines/Horde.ts'
import { BlogPage } from './pages/blog/BlogPage.ts'
import { PostPage } from './pages/blog/PostPage.ts'
import { HomePage } from './pages/HomePage.ts'
import { ManorPage } from './pages/manor/ManorPage.ts'
import { NotFoundPage } from './pages/NotFoundPage.ts'
import { RestPage } from './pages/rest/RestPage.ts'
import { SiteRoute } from './routes.ts'
import { documentStyles } from './site/document.ts'
import { SiteSnapshot, initialSnapshot, siteActors, siteSnapshots } from './site/actors.ts'
import { Keys, KeysEvent } from './site/machines/Keys.ts'
import { Page, PageEvent, PageState, pageOf } from './site/machines/Page.ts'
import { classOf } from './styles/sx.ts'
import { paper } from './styles/tokens.stylex.ts'
import { Thesis, ThesisEvent, thesisText } from './thesis/machines/Thesis.ts'
import { Dock, Toast } from './toast/components/Toast.ts'

const siteInputs = {
  ClickedThesis: {},
  ClickedWebGpu: {},
  PlayedWithTeddy: {},
  FoundEggInPost: { egg: EggId },
  StartedGpu: { supported: Schema.Boolean },
  CountedInfected: { infected: Schema.Finite },
  ClickedZombie: { id: Schema.Finite },
  PressedKey: { key: Schema.String },
  CalledHello: {},
  StartedPrint: {},
  Navigated: { route: SiteRoute },
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
      const page = yield* Page
      return ({ input }: { readonly input: SiteInput }) =>
        SiteInput.match(input, {
          ClickedThesis: () => thesis.send(ThesisEvent.Clicked),
          ClickedWebGpu: () => gpu.send(GpuEvent.Clicked),
          PlayedWithTeddy: () => eggs.send(EggsEvent.Found({ egg: 'teddy' })),
          FoundEggInPost: ({ egg }) => eggs.send(EggsEvent.Found({ egg })),
          StartedGpu: ({ supported }) => gpu.send(GpuEvent.Started({ supported })),
          CountedInfected: ({ infected }) => gpu.send(GpuEvent.Counted({ infected })),
          ClickedZombie: ({ id }) => horde.send(HordeEvent.Munched({ id })),
          PressedKey: ({ key }) => keys.send(KeysEvent.Pressed({ key })),
          CalledHello: () => eggs.send(EggsEvent.Found({ egg: 'console' })),
          StartedPrint: () => eggs.send(EggsEvent.Found({ egg: 'print' })),
          Navigated: ({ route }) => page.send(PageEvent.Navigated({ route })),
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

const SiteDef = Html.component({
  name: 'Site',
  props: SiteProps,
  model: SiteSnapshot,
  message: SiteMessage,
})

interface RoomColor {
  readonly name: 'blueprint' | 'manor' | 'rest'
  readonly color: string
}

const roomColorOf = (page: PageState): RoomColor =>
  PageState.$match(page, {
    Home: () => BLUEPRINT,
    Manor: () => MANOR,
    Rest: () => REST,
    Blog: () => BLUEPRINT,
    Post: () => BLUEPRINT,
    NotFound: () => BLUEPRINT,
  })

const BLUEPRINT: RoomColor = { name: 'blueprint', color: paper.blueprint }
const MANOR: RoomColor = { name: 'manor', color: paper.manor }
const REST: RoomColor = { name: 'rest', color: paper.rest }

const roomStyle = (room: RoomColor) =>
  Match.value(room.name).pipe(
    Match.when('manor', () => Option.some(documentStyles.manor)),
    Match.when('rest', () => Option.some(documentStyles.rest)),
    Match.orElse(() => Option.none()),
  )

const manorTitle = (room: RoomId): string => {
  if (room === 'parlour') return 'The Manor · Tanner Scadden'
  return `${Str.capitalize(room)} · The Manor · Tanner Scadden`
}

interface KeyPress {
  readonly key: string
  readonly editable: boolean
  readonly repeat: boolean
}

const pressedKey = ({ key, editable, repeat }: KeyPress): Option.Option<SiteMessage> => {
  if (editable || repeat) return Option.none()
  return Option.some(SiteMessage.PressedKey({ key }))
}

const titleOf = (page: PageState): string =>
  PageState.$match(page, {
    Home: () => 'Tanner Scadden',
    Manor: ({ room }) => manorTitle(room),
    Rest: () => 'Rest · Tanner Scadden',
    Blog: () => 'Blog · Tanner Scadden',
    Post: ({ slug }) =>
      Option.match(findPost(slug), {
        onNone: () => 'Blog · Tanner Scadden',
        onSome: post => `${post.title} · Tanner Scadden`,
      }),
    NotFound: () => 'Not found · Tanner Scadden',
  })

const page = SiteDef.fragment((h, model: SiteSnapshot) =>
  Match.valueTags(model.page, {
    Home: () =>
      HomePage(h, {
        eggs: model.eggs,
        thesis: thesisText(model.thesis),
        clickedThesis: SiteMessage.ClickedThesis(),
        clickedWebGpu: SiteMessage.ClickedWebGpu(),
        playedWithTeddy: SiteMessage.PlayedWithTeddy(),
        still: h.props.reducedMotion,
      }),
    Manor: ({ room }) =>
      ManorPage(h, {
        room,
        rattles: model.rattles,
        reducedMotion: h.props.reducedMotion,
      }),
    Rest: () => RestPage(h),
    Blog: () => BlogPage(h),
    Post: ({ slug }) =>
      Option.match(findPost(slug), {
        onNone: () => NotFoundPage(h),
        onSome: post => PostPage(h, post, egg => SiteMessage.FoundEggInPost({ egg })),
      }),
    NotFound: () => NotFoundPage(h),
  }),
)

export const SiteNoDeps = SiteDef.make({
  init: $ => initialSnapshot($.props),
  update: ($, message) =>
    SiteMessage.matchOrElse(
      message,
      {
        ChangedActors: ({ snapshot }) => ({ ...snapshot, page: $.model.page }),
        Navigated: input =>
          $.evolve({ page: pageOf(input.route) }).run(Dispatch.make({ input })),
      },
      input => $.run(Dispatch.make({ input })),
    ),
  subscriptions: $ => [
    Router.subscription(SiteRoute, $.props.route, route =>
      SiteMessage.Navigated({ route }),
    ),
    Subscription.make(
      'actors',
      Stream.map(siteSnapshots, snapshot => SiteMessage.ChangedActors({ snapshot })),
    ),
    HtmlSubscription.onDocument('keydown', press =>
      Option.getOrUndefined(pressedKey(press)),
    ),
    devtools(SiteMessage.CalledHello()),
    beforePrint(SiteMessage.StartedPrint()),
  ],
  head: $ => {
    const room = roomColorOf($.model.page)
    return [
      Head.title(titleOf($.model.page)),
      HtmlHead.lang('en'),
      roomStyle(room).pipe(Option.toArray, classOf, HtmlHead.htmlClass),
      HtmlHead.bodyClass(classOf(documentStyles.body, Option.toArray(roomStyle(room)))),
      HtmlHead.meta({ name: 'theme-color', content: room.color }),
    ]
  },
  view: (h, model) => {
    const room = roomColorOf(model.page)
    return h.div(
      Blueprint(h, {
        gpu: model.gpu,
        hidden: room !== BLUEPRINT,
        still: h.props.reducedMotion,
        started: supported => SiteMessage.StartedGpu({ supported }),
        infected: count => SiteMessage.CountedInfected({ infected: count }),
      }),
      page(h, model),
      Zombies(h, zombiesOf(model.horde), id => SiteMessage.ClickedZombie({ id })),
      room === BLUEPRINT && Outbreak(h, model.gpu),
      Bool.match(room === BLUEPRINT && model.page._tag !== 'NotFound', {
        onTrue: () => Toast(h, model.toast),
        onFalse: () => Dock(h, model.toast, room.name),
      }),
    )
  },
})

export const Site = SiteNoDeps.pipe(
  Component.provide((props: SiteProps) =>
    Layer.provideMerge(Dispatch.layer, siteActors(props)),
  ),
)
