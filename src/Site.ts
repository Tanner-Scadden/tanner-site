import { Command, Component, Head, Router, Subscription, UiSchema } from '@effect/ui'
import { Html, HtmlHead, HtmlSubscription } from '@effect/ui/html'
import { Effect, Layer, Option, Schema, Stream, String as Str } from 'effect'

import { EggId } from '#domain/Egg'

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
import { Page, PageEvent, PageState } from './site/machines/Page.ts'
import { classOf } from './styles/sx.ts'
import { paper } from './styles/tokens.stylex.ts'
import { Thesis, ThesisEvent, thesisText } from './thesis/machines/Thesis.ts'
import { Dock, Toast } from './toast/components/Toast.ts'

// What the page reports: everything the user did, handed to the actors as is.
const siteInputs = {
  ClickedThesis: {},
  ClickedWebGpu: {},
  PlayedWithTeddy: {},
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

// NOTE: the Model is the actors' snapshot and nothing else. Every message
// but the sync is something the user did, handed to the actors as is.
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

// NOTE: the body carries the blueprint paper, which the document shows
// through. The hidden pages paint over it, on <html> too.
const roomStyle = (room: RoomColor) =>
  room === MANOR ? documentStyles.manor : room === REST ? documentStyles.rest : null

const titleOf = (page: PageState): string =>
  PageState.$match(page, {
    Home: () => 'Tanner Scadden',
    Manor: ({ room }) =>
      room === 'parlour'
        ? 'The Manor · Tanner Scadden'
        : `${Str.capitalize(room)} · The Manor · Tanner Scadden`,
    Rest: () => 'Rest · Tanner Scadden',
    Blog: () => 'Blog · Tanner Scadden',
    Post: ({ slug }) =>
      Option.match(findPost(slug), {
        onNone: () => 'Blog · Tanner Scadden',
        onSome: post => `${post.title} · Tanner Scadden`,
      }),
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
        playedWithTeddy: SiteMessage.PlayedWithTeddy(),
        still: h.props.reducedMotion,
      })
    case 'Manor':
      return ManorPage(h, {
        room: model.page.room,
        rattles: model.rattles,
        reducedMotion: h.props.reducedMotion,
      })
    case 'Rest':
      return RestPage(h)
    case 'Blog':
      return BlogPage(h)
    case 'Post':
      return Option.match(findPost(model.page.slug), {
        onNone: () => NotFoundPage(h),
        onSome: post => PostPage(h, post),
      })
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
  subscriptions: $ => [
    // NOTE: the route comes through the root, not the Page actor reading the
    // Router itself: the browser Router scrolls to the top (or back to the
    // saved spot), announces the page and moves focus once the root has it.
    Router.subscription(SiteRoute, $.props.route, route =>
      SiteMessage.Navigated({ route }),
    ),
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
      HtmlHead.htmlClass(classOf(roomStyle(room))),
      HtmlHead.bodyClass(classOf(documentStyles.body, roomStyle(room))),
      HtmlHead.meta({ name: 'theme-color', content: room.color }),
    ]
  },
  // NOTE: the blueprint canvas, the horde and the toast sit outside the
  // page, so they carry across pages and the GPU never restarts.
  view: (h, model) => {
    const room = roomColorOf(model.page)
    return h.div(
      Blueprint(h, {
        gpu: model.gpu,
        // The hidden pages have their own colors, so the blueprint steps out.
        hidden: room !== BLUEPRINT,
        still: h.props.reducedMotion,
        started: supported => SiteMessage.StartedGpu({ supported }),
        infected: count => SiteMessage.CountedInfected({ infected: count }),
      }),
      page(h, model),
      Zombies(h, zombiesOf(model.horde), id => SiteMessage.ClickedZombie({ id })),
      // The counter only shows on pages that show the pens.
      room === BLUEPRINT && Outbreak(h, model.gpu),
      // The hidden pages dock the toast as the way home; the blog keeps it.
      room === BLUEPRINT && model.page._tag !== 'NotFound'
        ? Toast(h, model.toast)
        : Dock(h, model.toast, room.name),
    )
  },
})

// NOTE: the actors start when the Site mounts, seeded from its props, and
// stop when it unmounts.
export const Site = SiteNoDeps.pipe(
  Component.provide((props: SiteProps) =>
    Layer.provideMerge(Dispatch.layer, siteActors(props)),
  ),
)
