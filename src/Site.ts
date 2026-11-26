import { Component, Head, Mount, Subscription, UiSchema } from '@effect/ui'
import { Html, HtmlHead, HtmlSubscription } from '@effect/ui/html'
import { Array as Arr, Schema, Stream, String as Str } from 'effect'

import { Dialogue } from './components/Dialogue'
import { Workshop } from './components/Workshop'
import {
  ELSEWHERE,
  MUNCH_MANOR_URL,
  SITE_REPO_URL,
  OPEN_SOURCE,
  PARLOUR_FACTS,
  PARLOUR_SAYS,
  ROOMS,
  ROOM_NAMES,
  ROOM_TAGS,
  type RoomId,
  SHELF,
  REST_FACTS,
  SHOTS,
  TROPHY_REST,
  TROPHY_SAYS,
  WORK,
} from './content'
import {
  EGG_COUNT,
  EGG_HINTS,
  EGG_NAMES,
  EggId,
  beforePrint,
  devtools,
} from './eggs'
import { GpuBlueprint } from './gpu/Blueprint'
import type { EggsState } from './machines/Eggs'
import type { GpuState } from './machines/Gpu'
import { type Zombie, zombiesOf } from './machines/Horde'
import { PageState } from './machines/Page'
import {
  Dispatch,
  SiteSnapshot,
  initialSnapshot,
  siteActors,
  siteInputs,
  siteSnapshots,
} from './machines/Site'
import { thesisText } from './machines/Thesis'
import type { ToastState } from './machines/Toast'
import { SiteRoute, homeRoute, href, restRoute, roomRoute } from './routes'
import { type SpriteName, SPRITE_SIZE, spriteShadow } from './sprites'

export const SiteMessage = UiSchema.TaggedEnum({
  ...siteInputs,
  ChangedActors: { snapshot: SiteSnapshot },
})
export type SiteMessage = typeof SiteMessage.Type

const SiteProps = Schema.Struct({
  found: Schema.Array(EggId),
  reducedMotion: Schema.Boolean,
  route: SiteRoute,
})

// NOTE: the Model is the actors' snapshot and nothing else. Every message
// but the sync is something the user did, handed to the actors as is.
const SiteDef = Html.component({
  name: 'Site',
  props: SiteProps,
  model: SiteSnapshot,
  message: SiteMessage,
})

const foundOf = (eggs: EggsState): ReadonlyArray<EggId> => eggs.found

// ---------------------------------------------------------------------------
// View
// ---------------------------------------------------------------------------

const sprite = SiteDef.fragment((h, name: SpriteName, pixel: number) =>
  h.span
    .class('sprite')
    .attr('aria-hidden', 'true')
    .style({
      width: `${SPRITE_SIZE * pixel}px`,
      height: `${SPRITE_SIZE * pixel}px`,
    })
    .children(
      h.span.class('px').style({
        width: `${pixel}px`,
        height: `${pixel}px`,
        boxShadow: spriteShadow({ name, pixel }),
      }),
    ),
)

const label = SiteDef.fragment((h, n: number, text: string) =>
  h.div.class('label').children(h.i(String(n)), text),
)

const toastView = SiteDef.fragment((h, toast: ToastState) =>
  h.div
    .class('toast', toast._tag === 'Showing' && 'on')
    .attr('role', 'status')
    .children(toast._tag === 'Showing' ? toast.text : ''),
)

// NOTE: on a hidden page the toast never leaves. It floats at the bottom as
// the way home, and shows the latest news (like EGG FOUND) while there is
// some, then turns back into BACK.
const dock = SiteDef.fragment((h, toast: ToastState) => {
  const text = toast._tag === 'Showing' ? toast.text : toast.last
  return h.a
    .class('toast', 'on', 'dock', toast._tag === 'Showing' && 'news')
    .attrs({ href: href(homeRoute), 'aria-label': 'Back to the front page' })
    .children(
      h.span
        .class('news-text')
        .attrs({
          role: 'status',
          // NOTE: the text's length in characters, so the CSS can ease the
          // pill's width from exactly this text down to BACK.
          style: `--chars: ${text.length}`,
        })
        .children(text),
      h.span.class('back-text').attr('aria-hidden', 'true').children('← BACK'),
    )
})

const questLog = SiteDef.fragment((h, eggs: EggsState) => {
  const found = foundOf(eggs)
  return (
  h.div
    .class('log')
    .attrs({ id: 'quest-log', role: 'tooltip' })
    .children(
      h.div
        .class('log-head')
        .children(
          eggs._tag === 'AllFound'
            ? 'ALL FOUND. THANKS FOR LOOKING AROUND.'
            : `QUEST LOG · ${found.length} OF ${EGG_COUNT} FOUND`,
        ),
      h.ol(
        ...Arr.map(EggId.literals, egg =>
          found.includes(egg)
            ? h.li
                .class('done')
                .children(h.b('✓'), h.span(EGG_NAMES[egg]))
            : h.li(h.b('?'), h.span(h.em('???'), h.small(EGG_HINTS[egg]))),
        ),
      ),
    ))
})

const topBar = SiteDef.fragment((h, eggs: EggsState) =>
  h.div
    .class('top')
    .children(
      h.span('TANNER SCADDEN'),
      h.nav(
        h.a.attr('href', '#work').children('WORK'),
        h.a.attr('href', '#oss').children('OPEN SOURCE'),
        h.a.attr('href', '#outside').children('OUTSIDE WORK'),
      ),
      h.span
        .class('eggs', eggs.found.length > 0 && 'got')
        .attrs({ tabindex: '0', 'aria-describedby': 'quest-log' })
        .children(`EGGS ${eggs.found.length}/${EGG_COUNT}`, questLog(h, eggs)),
    ),
)

const hero = SiteDef.fragment((h, thesis: string) =>
  h.header
    .class('hero')
    .children(
      h.h1('Tanner Scadden'),
      h.p.class('role').children('Product engineer'),
      h.p
        .class('thesis')
        .attrs({ role: 'button', tabindex: '0' })
        .on('click', SiteMessage.ClickedThesis())
        .on(
          'keydown',
          ({ key }) =>
            key === 'Enter' || key === ' ' ? SiteMessage.ClickedThesis() : undefined,
          { preventDefault: true },
        )
        .children(thesis),
      h.p
        .class('bio')
        .children(
          "I'm usually one of the first engineers at an early startup. I figure out what to build, build it, and keep it running. Mostly TypeScript and Effect these days. Self-taught.",
        ),
    ),
)

const step = SiteDef.fragment((h, title: string, text: string, out: boolean) =>
  h.div.class('step', out && 'out').children(h.small(title), h.p(text)),
)

const work = SiteDef.fragment(h =>
  h.section
    .class('blk')
    .attr('id', 'work')
    .children(
      label(h, 1, 'SELECTED WORK'),
      h.div.class('work').children(
        ...Arr.map(WORK, job =>
          h.div
            .class('job')
            .children(
              h.div
                .class('meta')
                .children(
                  h.small(job.when),
                  h.strong(
                    h.a
                      .attrs({ href: job.href, target: '_blank', rel: 'noopener noreferrer' })
                      .children(job.name),
                  ),
                  h.small(job.role),
                ),
              h.div
                .class('flow')
                .children(
                  step(h, 'PROBLEM', job.problem, false),
                  h.div.class('arr').attr('aria-hidden', 'true').children('→'),
                  step(h, 'APPROACH', job.approach, false),
                  h.div.class('arr').attr('aria-hidden', 'true').children('→'),
                  step(h, 'RESULT', job.result, true),
                ),
            ),
        ),
      ),
    ),
)

const openSource = SiteDef.fragment(h =>
  h.section
    .class('blk')
    .attr('id', 'oss')
    .children(
      label(h, 2, 'OPEN SOURCE'),
      h.div.class('two').children(
        h.p
          .class('p')
          .children(
            "I love working on open source. If a tool I'm using has a bug or is missing something, I'd rather jump in and open a PR than hack around it.",
          ),
        h.ul
          .class('plain')
          .children(
            ...Arr.map(OPEN_SOURCE, project =>
              h.li(
                h.a
                  .attrs({
                    href: project.href,
                    target: '_blank',
                    rel: 'noopener noreferrer',
                  })
                  .children(
                  h.span(project.name),
                  h.span.class('what').children(project.what),
                  h.span.attr('aria-hidden', 'true').children('↗'),
                ),
              ),
            ),
          ),
      ),
    ),
)

const outside = SiteDef.fragment(h =>
  h.section
    .class('blk')
    .attr('id', 'outside')
    .children(
      label(h, 3, 'OUTSIDE WORK'),
      h.p
        .class('p')
        .children(
          "I've always played games, and for a few years I ",
          h.a
            .attr('href', href(restRoute))
            .children('played them professionally'),
          ': Arena of Valor with Allegiance, then Wild Rift with Sentinels, and made it to worlds three times. These days I mostly build them, sometimes with my family.',
        ),
      h.p
        .class('p')
        .children(
          "When I'm not at a keyboard, I'm usually hanging out with my wife Demi, our dog Teddy and our cat Rain.",
        ),
    ),
)

const footer = SiteDef.fragment(h =>
  h.footer
    .class('foot')
    .children(
      h.div(h.small('TANNER SCADDEN'), h.strong('Product engineer')),
      h.div(
        h.small('ELSEWHERE'),
        ...Arr.flatMap(ELSEWHERE, (link, i) => [
          i > 0 && ' · ',
          h.a.attr('href', link.href).children(link.label),
        ]),
      ),
      h.div(
        h.small('THIS SITE'),
        'Effect UI + ',
        h.span
          .class('egg')
          .attrs({ role: 'button', tabindex: '0' })
          .on('click', SiteMessage.ClickedWebGpu())
          .on(
            'keydown',
            ({ key }) =>
              key === 'Enter' || key === ' '
                ? SiteMessage.ClickedWebGpu()
                : undefined,
            { preventDefault: true },
          )
          .children('WebGPU'),
        ' on Cloudflare · ',
        h.a
          .class('source')
          .attrs({ href: SITE_REPO_URL, target: '_blank', rel: 'noopener noreferrer' })
          .children('source ↗'),
      ),
      h.div.class('door-cell').children(
        h.a
          .class('door')
          .attr('href', href(SiteRoute.Manor()))
          .attr('aria-label', 'Open the hidden room')
          .children(h.small('DOOR D-13'), h.strong('Do not open')),
      ),
    ),
)

const paras = SiteDef.fragment((h, lines: ReadonlyArray<string>) =>
  Arr.map(lines, line => h.p(line)),
)

const parlour = SiteDef.fragment(h =>
  h.section
    .class('panel')
    .children(
      h.h2('THE GAME'),
      ...paras(h, PARLOUR_SAYS),
      h.dl.class('facts').children(
        ...Arr.map(PARLOUR_FACTS, fact =>
          h.div(h.dt(fact.label), h.dd(fact.value)),
        ),
      ),
    ),
)

const trophyRoom = SiteDef.fragment(h =>
  h.section
    .class('panel')
    .children(
      h.h2('WHERE IT CAME FROM'),
      ...paras(h, TROPHY_SAYS),
      h.ul.class('shelf').attr('aria-label', 'The games that made this one').children(
        ...Arr.map(SHELF, plaque =>
          h.li(sprite(h, 'trophy', 3.5), h.b(plaque.name), h.span(plaque.note)),
        ),
      ),
      h.p
        .class('aside')
        .children(h.a.attr('href', href(restRoute)).children(TROPHY_REST)),
    ),
)

const manor = SiteDef.fragment((h, room: RoomId) =>
  h.main
    .class('manor')
    .attr('aria-label', 'Hidden room')
    .children(
      h.div.class('mw').children(
        h.div
          .class('mh')
          .children(
            h.span('SCADDEN MANOR'),
            h.a.attr('href', href(homeRoute)).children('BACK'),
          ),
        h.h1.class('mt').children('YOU FOUND THE MANOR'),
        h.nav
          .class('rooms')
          .attr('aria-label', 'Rooms')
          .children(
            ...Arr.map(ROOMS, r =>
              h.a
                .class('room', r === room && 'on')
                .attr('href', href(roomRoute(r)))
                .attr('aria-current', r === room ? 'page' : 'false')
                .children(
                  h.b(ROOM_NAMES[r]),
                  h.small(ROOM_TAGS[r]),
                  sprite(h, ROOM_SPRITES[r], 4.5),
                ),
            ),
          ),
        Dialogue(h, {
          key: room,
          props: { room, reducedMotion: h.props.reducedMotion },
        }),
        room === 'parlour' && parlour(h),
        room === 'trophy' && trophyRoom(h),
        room === 'workshop' &&
          Workshop(h, { props: { reducedMotion: h.props.reducedMotion } }),
        h.div
          .class('play')
          .children(
            h.a
              .attrs({
                href: MUNCH_MANOR_URL,
                target: '_blank',
                rel: 'noopener',
              })
              .children('PLAY MUNCH MANOR ↗'),
            h.span('Free, in your browser, up to 4 players.'),
          ),
      ),
    ),
)

const ROOM_SPRITES: Record<RoomId, SpriteName> = {
  parlour: 'tanner',
  trophy: 'trophy',
  workshop: 'zombie',
}

const worlds = SiteDef.fragment(h =>
  h.main
    .class('worlds')
    .attr('aria-label', 'Playing days')
    .children(
      h.div.class('wg').children(
        h.div
          .class('bar')
          .children(
            h.span('REPLAY · 2018 → 2022'),
            h.a.attr('href', href(homeRoute)).children('GG, BACK TO WORK'),
          ),
        h.h1('REST'),
        h.div
          .class('sub')
          .children(
            ...Arr.flatMap(REST_FACTS, (fact, i) => [
              i > 0 && ' ',
              h.span(i < REST_FACTS.length - 1 ? `${fact} ·` : fact),
            ]),
          ),
        h.div.class('shots').children(
          ...Arr.flatMap(SHOTS, shot =>
            shot.photo === undefined
              ? []
              : [
                  h.figure
                    .class('shot', shot.size)
                    .children(
                      h.img.attrs({
                        src: `/${shot.photo}`,
                        alt: `${shot.title}, ${shot.when}`,
                        loading: 'lazy',
                      }),
                      h.figcaption(h.span(shot.when), shot.title),
                    ),
                ],
          ),
        ),
      ),
    ),
)

const notFound = SiteDef.fragment(h =>
  h.main
    .class('sheet')
    .children(
      h.header
        .class('hero')
        .children(
          h.h1('Sheet not found'),
          h.p.class('role').children('404'),
          h.p
            .class('bio')
            .children(
              "This drawing isn't in the set. ",
              h.a.attr('href', href(homeRoute)).children('Back to the front page'),
              '.',
            ),
        ),
    ),
)

const horde = SiteDef.fragment(
  (h, zombies: ReadonlyArray<Zombie>) =>
    zombies.length > 0 &&
    h.div.class('horde').children(
      ...Arr.map(zombies, z =>
        h.button
          .key(String(z.id))
          .class('zombie')
          .attr('type', 'button')
          .attr('aria-label', 'Munch this zombie')
          .on('click', SiteMessage.ClickedZombie({ id: z.id }))
          .style({
            left: `${z.x}px`,
            transform: `translateY(${Math.sin(z.x / 8) * 2}px)`,
          })
          .children(sprite(h, 'zombie', 3.5)),
      ),
    ),
)

const blueprint = SiteDef.fragment((h, gpu: GpuState, still: boolean) =>
  h.canvas
    .class('blueprint')
    .attr('aria-hidden', 'true')
    .onMount(
      GpuBlueprint({ flow: gpu._tag === 'Drafting', still }).pipe(
        Mount.map(supported => SiteMessage.StartedGpu({ supported })),
      ),
    ),
)

const home = SiteDef.fragment(
  (h, model: SiteSnapshot) =>
  h.div
    .class('sheet')
    .children(
      topBar(h, model.eggs),
      hero(h, thesisText(model.thesis)),
      work(h),
      openSource(h),
      outside(h),
      footer(h),
    ),
)

// NOTE: the blueprint canvas, the horde and the toast sit outside the page,
// so they carry across pages and the GPU never restarts.
const page = SiteDef.fragment((h, model: SiteSnapshot) => {
  switch (model.page._tag) {
    case 'Home':
      return home(h, model)
    case 'Manor':
      return manor(h, model.page.room)
    case 'Rest':
      return worlds(h)
    case 'NotFound':
      return notFound(h)
  }
})

const siteView = SiteDef.view((h, model) =>
  h.div(
    blueprint(h, model.gpu, h.props.reducedMotion),
    page(h, model),
    horde(h, zombiesOf(model.horde)),
    model.page._tag === 'Home' ? toastView(h, model.toast) : dock(h, model.toast),
  ),
)

const roomColorOf = (
  page: PageState,
): { readonly name: string; readonly color: string } =>
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

export const SiteNoDeps = SiteDef.make({
  init: $ => initialSnapshot($.props),
  update: ($, message) =>
    message._tag === 'ChangedActors'
      ? message.snapshot
      : $.run(Dispatch.make({ input: message })),
  subscriptions: () => [
    Subscription.make(
      'actors',
      Stream.map(siteSnapshots, snapshot =>
        SiteMessage.ChangedActors({ snapshot }),
      ),
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
  view: siteView,
})

// NOTE: the actors start when the Site mounts, seeded from its props, and
// stop when it unmounts.
export const Site = SiteNoDeps.pipe(
  Component.provide((props: typeof SiteProps.Type) => siteActors(props)),
)
