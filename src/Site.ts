import {
  Command,
  Component,
  Head,
  Mount,
  Router,
  Subscription,
  UiSchema,
} from '@effect/ui'
import { Html, HtmlHead, HtmlSubscription } from '@effect/ui/html'
import { Array as Arr, Effect, Option, Schema, Stream, String as Str } from 'effect'

import {
  ELSEWHERE,
  MUNCH_MANOR_URL,
  SITE_REPO_URL,
  OPEN_SOURCE,
  PARLOUR_FACTS,
  PARLOUR_SAYS,
  RATTLES_SAYS,
  ROOMS,
  ROOM_NAMES,
  ROOM_TAGS,
  type RoomId,
  SHELF,
  REST_FACTS,
  SHOTS,
  THESES,
  TROPHY_REST,
  TROPHY_SAYS,
  WORK,
  WORKSHOP_SAYS,
  WORKSHOP_STACK,
} from './content'
import {
  EGG_COUNT,
  EGG_HINTS,
  EGG_NAMES,
  EggId,
  KONAMI,
  SaveEggs,
  beforePrint,
  devtools,
  isKonami,
  lower,
} from './eggs'
import { GpuBlueprint } from './gpu/Blueprint'
import {
  SiteRoute,
  homeRoute,
  href,
  restRoute,
  roomOf,
  roomRoute,
} from './routes'
import {
  COLS,
  DOORS,
  FIRST_SEED,
  ROWS,
  TURNS,
  type Shot,
  WAVES,
  type ZombieKind,
  nextSeed,
  runOf,
} from './replay'
import { SPRITE_SIZE, type SpriteName, spriteShadow } from './sprites'

const Gpu = Schema.Literals(['starting', 'on', 'off'])

const Zombie = Schema.Struct({
  id: Schema.Finite,
  x: Schema.Finite,
  speed: Schema.Finite,
})

const Toast = Schema.Struct({ id: Schema.Finite, text: Schema.String })

export const SiteMessage = UiSchema.TaggedEnum({
  ChangedRoute: { route: SiteRoute },
  Landed: {},
  TickedTypewriter: {},
  ClickedThesis: {},
  PressedKey: { key: Schema.String },
  CompletedMeasureViewport: { width: Schema.Finite },
  TickedFrame: { delta: Schema.Finite },
  ClickedZombie: { id: Schema.Finite },
  CalledHello: {},
  StartedPrint: {},
  ExpiredToast: { id: Schema.Finite },
  ClickedWebGpu: {},
  StartedGpu: { supported: Schema.Boolean },
  ClickedReplay: {},
  ClickedNewSeed: {},
  TickedReplay: {},
})

const TYPE_MS = 18
const REPLAY_MS = 450
const CHARS_PER_TICK = 2
const TOAST_MS = 2600
const MUNCHED_MS = 900
const HORDE_SIZE = 6
const ZOMBIE_GAP = 90
const ZOMBIE_WIDTH = 56
const FRAME_MS = 1000 / 60
const LONGEST_FRAME_MS = 100

// NOTE: the horde starts just past the right edge, so it needs the viewport
// width, which only the host knows.
export const MeasureViewport = Command.make('MeasureViewport', { args: {} }, () =>
  Effect.sync(() =>
    SiteMessage.CompletedMeasureViewport({ width: window.innerWidth }),
  ),
)

const SiteDef = Html.component({
  name: 'Site',
  props: Schema.Struct({
    found: Schema.Array(EggId),
    reducedMotion: Schema.Boolean,
    route: SiteRoute,
  }),
  model: Schema.Struct({
    found: Schema.Array(EggId),
    route: SiteRoute,
    typed: Schema.Finite,
    thesis: Schema.Finite,
    recentKeys: Schema.Array(Schema.String),
    zombies: Schema.Array(Zombie),
    toast: Schema.NullOr(Toast),
    // NOTE: the last toast's text outlives the toast, so the dock can shrink
    // it away smoothly instead of dropping it at once.
    lastToast: Schema.String,
    toastSeq: Schema.Finite,
    gpu: Gpu,
    flow: Schema.Boolean,
    seed: Schema.Finite,
    turn: Schema.Finite,
  }),
  message: SiteMessage,
})

const showToast = (text: string) =>
  SiteDef.update($ =>
    $.evolve({
      toast: { id: $.model.toastSeq, text },
      lastToast: text,
      toastSeq: seq => seq + 1,
    }),
  )

const award = (egg: EggId) =>
  SiteDef.update($ => {
    if ($.model.found.includes(egg)) return $.model
    const found = [...$.model.found, egg]
    return $.combine(
      $ => $.evolve({ found }),
      showToast(
        `EGG FOUND: ${Str.toUpperCase(EGG_NAMES[egg])} · ${found.length}/${EGG_COUNT}`,
      ),
    ).run(SaveEggs.make({ found }))
  })

// NOTE: the Workshop's replay starts over on every visit. With reduced
// motion it skips straight to the end.
const firstTurn = (reducedMotion: boolean): number => (reducedMotion ? TURNS : 0)

const typedFor = (route: SiteRoute, reducedMotion: boolean): number => {
  const room = roomOf(route)
  return room !== null && reducedMotion ? RATTLES_SAYS[room].length : 0
}

// NOTE: reaching the Manor or /rest finds its egg, by a link, a typed word,
// the back button or a URL pasted in.
const awardFor = (route: SiteRoute) =>
  SiteDef.update($ =>
    SiteRoute.match(route, {
      Home: () => $.model,
      Manor: () => $.combine(award('manor')),
      ManorRoom: () => $.combine(award('manor')),
      Rest: () => $.combine(award('worlds')),
      NotFound: () => $.model,
    }),
  )

const changedRoute = SiteDef.update('ChangedRoute', ($, { route }) =>
  $.combine(
    $ =>
      $.evolve({
        route,
        typed: typedFor(route, $.props.reducedMotion),
        turn: firstTurn($.props.reducedMotion),
      }),
    awardFor(route),
  ),
)

const navigate = (route: SiteRoute) =>
  Router.push(SiteRoute, route).pipe(Command.asNoop)

const pressedKey = SiteDef.update('PressedKey', ($, { key }) => {
  const recentKeys = Arr.takeRight([...$.model.recentKeys, lower(key)], KONAMI.length)
  const word = Arr.join(Arr.takeRight(recentKeys, 4), '')
  if (isKonami(recentKeys)) {
    return $.combine($ => $.evolve({ recentKeys }), award('konami')).run(
      MeasureViewport.make({}),
    )
  }
  if (key === 'Escape' && $.model.flow) {
    return $.evolve({ recentKeys, flow: false })
  }
  if (key === 'Escape' && $.model.route._tag !== 'Home') {
    return $.evolve({ recentKeys }).run(navigate(homeRoute))
  }
  if (word === 'rest' && $.model.route._tag === 'Home') {
    return $.evolve({ recentKeys }).run(navigate(restRoute))
  }
  return $.evolve({ recentKeys })
})

const summonHorde = SiteDef.update(
  'CompletedMeasureViewport',
  ($, { width }) =>
    $.evolve({
      zombies: Arr.makeBy(HORDE_SIZE, n => ({
        id: $.model.toastSeq * HORDE_SIZE + n,
        x: width + n * ZOMBIE_GAP,
        // NOTE: a spread of speeds without randomness, so the update stays
        // pure and the horde shuffles a little out of step.
        speed: 0.6 + ((n * 37) % 10) / 25,
      })),
    }),
)

const tickedFrame = SiteDef.update('TickedFrame', ($, { delta }) => {
  const step = Math.min(delta, LONGEST_FRAME_MS) / FRAME_MS
  return $.evolve({
    zombies: Arr.filter(
      Arr.map($.model.zombies, z => ({ ...z, x: z.x - z.speed * step })),
      z => z.x > -ZOMBIE_WIDTH,
    ),
  })
})

const clickedThesis = SiteDef.update('ClickedThesis', $ => {
  const thesis = ($.model.thesis + 1) % THESES.length
  return thesis === THESES.length - 1
    ? $.combine($ => $.evolve({ thesis }), award('thesis'))
    : $.evolve({ thesis })
})

// NOTE: "WebGPU" in the footer turns the drafting pens on and off. A browser
// without WebGPU still finds the egg, and is told why nothing moved.
const clickedWebGpu = SiteDef.update('ClickedWebGpu', $ => {
  if ($.model.gpu === 'off') {
    return $.combine(award('gpu'), showToast('NO WEBGPU IN THIS BROWSER, BUT IT COUNTS'))
  }
  const flow = !$.model.flow
  return flow
    ? $.combine($ => $.evolve({ flow }), award('gpu'))
    : $.evolve({ flow })
})

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

const toastView = SiteDef.fragment((h, toast: typeof Toast.Type | null) =>
  h.div
    .class('toast', toast !== null && 'on')
    .attr('role', 'status')
    .children(toast?.text ?? ''),
)

// NOTE: on a hidden page the toast never leaves. It floats at the bottom as
// the way home, and shows the latest news (like EGG FOUND) while there is
// some, then turns back into BACK.
const dock = SiteDef.fragment((h, toast: typeof Toast.Type | null, lastToast: string) =>
  h.a
    .class('toast', 'on', 'dock', toast !== null && 'news')
    .attrs({ href: href(homeRoute), 'aria-label': 'Back to the front page' })
    .children(
      h.span
        .class('news-text')
        .attrs({
          role: 'status',
          // NOTE: the text's length in characters, so the CSS can ease the
          // pill's width from exactly this text down to BACK.
          style: `--chars: ${(toast?.text ?? lastToast).length}`,
        })
        .children(toast?.text ?? lastToast),
      h.span.class('back-text').attr('aria-hidden', 'true').children('← BACK'),
    ),
)

const questLog = SiteDef.fragment((h, found: ReadonlyArray<EggId>) =>
  h.div
    .class('log')
    .attrs({ id: 'quest-log', role: 'tooltip' })
    .children(
      h.div
        .class('log-head')
        .children(
          found.length === EGG_COUNT
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
    ),
)

const topBar = SiteDef.fragment((h, found: ReadonlyArray<EggId>) =>
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
        .class('eggs', found.length > 0 && 'got')
        .attrs({ tabindex: '0', 'aria-describedby': 'quest-log' })
        .children(`EGGS ${found.length}/${EGG_COUNT}`, questLog(h, found)),
    ),
)

const hero = SiteDef.fragment((h, thesis: number) =>
  h.header
    .class('hero')
    .children(
      h.h1('Tanner Scadden'),
      h.p.class('role').children('Full stack engineer'),
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
        .children(THESES[thesis] ?? THESES[0]),
      h.p
        .class('bio')
        .children(
          "Founding engineer, usually one of the first few hires at an early startup. I work across the stack in TypeScript, mostly with Effect these days. Self-taught.",
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
                .children(h.small(job.when), h.strong(job.name), h.small(job.role)),
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
      h.div(h.small('TANNER SCADDEN'), h.strong('Full stack engineer')),
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

const pad = (n: number, width: number) => Str.padStart(width, '0')(String(n))

// NOTE: the Workshop board is a little arcade screen. The survivors are the
// game's four default crew and the zombies are its own sprites, all drawn at
// one shared pixel size: a tile is 10 game pixels across.
const ART = '/manor/'
const TILE_PX = 10
const ZOMBIE_ART: Record<ZombieKind, { readonly src: string; readonly w: number }> = {
  walker: { src: `${ART}walker.png`, w: 12 },
  lid: { src: `${ART}lid.png`, w: 18 },
  brute: { src: `${ART}brute.png`, w: 26 },
}
const SURVIVOR_W = 8

// Where on the board a point is, in tiles, as CSS percentages.
const pct = (x: number, y: number) => ({
  x: `${((x + 0.5) / COLS) * 100}%`,
  y: `${((y + 0.5) / ROWS) * 100}%`,
})

// NOTE: shots leave the gun (low on the survivor's right, or left when they
// face left) and land mid-body on the zombie. Misses fly a little wide.
const GUN = { x: 0.3, y: -0.12 }
const ZOMBIE_H: Record<ZombieKind, number> = { walker: 17, lid: 19, brute: 26 }

const shotPath = (shot: Shot, kind: ZombieKind | undefined) => {
  const side = shot.x1 < shot.x0 ? -1 : 1
  const x0 = shot.x0 + GUN.x * side
  const y0 = shot.y0 + GUN.y
  const wide = shot.hit ? 0 : (shot.by - 1.5) * 0.45
  const x1 = shot.x1 + wide * 0.5
  const y1 = shot.y1 - 0.3 * ((kind === undefined ? 17 : ZOMBIE_H[kind]) / TILE_PX) + wide
  return { x0, y0, x1, y1, angle: (Math.atan2(y1 - y0, x1 - x0) * 180) / Math.PI }
}

const onTile = (x: number, y: number, w: number) => ({
  left: `${((x + 0.5) / COLS) * 100}%`,
  top: `${((y + 0.5) / ROWS) * 100}%`,
  width: `${(w / (COLS * TILE_PX)) * 100}%`,
})

const workshop = SiteDef.fragment((h, seed: number, turn: number) => {
  const run = runOf(seed)
  const frame = run.frames[Math.min(turn, TURNS)] ?? run.frames[0]!
  const done = turn >= TURNS
  const standing = Arr.filter(frame.survivors, s => s.up).length
  const before = run.frames[Math.max(0, Math.min(turn, TURNS) - 1)] ?? frame
  const targetOf = (shot: Shot) =>
    Arr.findFirst(before.zombies, z => z.x === shot.x1 && z.y === shot.y1).pipe(
      Option.map(z => z.kind),
      Option.getOrUndefined,
    )
  const shotBy = (id: number) => Arr.findFirst(frame.shots, shot => shot.by === id)
  // Survivors face whoever they just shot at, or whoever is closest.
  const facesLeft = (id: number, x: number, y: number) => {
    const shot = shotBy(id)
    if (Option.isSome(shot)) return shot.value.x1 < shot.value.x0
    let best: { readonly x: number; readonly y: number } | undefined
    for (const z of frame.zombies) {
      const d = Math.abs(z.x - x) + Math.abs(z.y - y)
      if (best === undefined || d < Math.abs(best.x - x) + Math.abs(best.y - y)) best = z
    }
    return best !== undefined && best.x < x
  }
  return h.section
    .class('panel')
    .children(
      h.h2("HOW IT'S BUILT"),
      h.div.class('screen').children(
        h.div
          .class('hud')
          .attr('aria-live', 'polite')
          .children(
            h.span(`WAVE ${frame.wave}/${WAVES}`),
            h.span
              .class('hearts')
              .attr('aria-label', `${standing} of 4 survivors standing`)
              .children(
                ...Arr.map(frame.survivors, s =>
                  h.i.class(!s.up && 'lost').attr('aria-hidden', 'true'),
                ),
              ),
            h.span(`KILLS ${pad(frame.downed, 2)}`),
          ),
        h.div
          .class('board')
          .attr('role', 'img')
          .attr(
            'aria-label',
            `Replay of seed ${seed}, wave ${frame.wave} of ${WAVES}: ${standing} survivors standing and ${frame.zombies.length} zombies in the room`,
          )
          .children(
            ...Arr.map(DOORS, d =>
              h.span.class('doorway').style({
                left: `${(d.x / COLS) * 100}%`,
                top: `${(d.y / ROWS) * 100}%`,
              }),
            ),
            ...Arr.map(frame.survivors, s =>
              h.div
                .key(`p${s.id}`)
                .class(
                  'tok',
                  'survivor',
                  !s.up && 'down',
                  s.up && facesLeft(s.id, s.x, s.y) && 'left',
                )
                .style({
                  ...onTile(s.x, s.y, SURVIVOR_W),
                  backgroundImage: `url(${ART}survivor-${s.id}.png)`,
                }),
            ),
            ...Arr.map(frame.zombies, z =>
              h.div
                .key(`z${z.id}`)
                .class('tok', 'zed', z.kind, frame.hits.includes(z.id) && 'hit')
                .style(onTile(z.x, z.y, ZOMBIE_ART[z.kind].w))
                .children(h.img.attrs({ src: ZOMBIE_ART[z.kind].src, alt: '' })),
            ),
            ...Arr.map(frame.splats, d =>
              h.div
                .key(`d${d.id}`)
                .class('tok', 'dying')
                .style(onTile(d.x, d.y, ZOMBIE_ART[d.kind].w))
                .children(h.img.attrs({ src: ZOMBIE_ART[d.kind].src, alt: '' })),
            ),
            ...Arr.flatMap(frame.shots, shot => {
              const path = shotPath(shot, targetOf(shot))
              const from = pct(path.x0, path.y0)
              const to = pct(path.x1, path.y1)
              return [
                h.span
                  .key(`f${turn}-${shot.by}`)
                  .class('flash')
                  .style({ left: from.x, top: from.y }),
                h.span
                  .key(`b${turn}-${shot.by}`)
                  .class('bullet')
                  .style({
                    '--x0': from.x,
                    '--y0': from.y,
                    '--x1': to.x,
                    '--y1': to.y,
                    '--a': `${path.angle}deg`,
                  }),
              ]
            }),
            done &&
              h.div
                .class('verdict', run.held ? 'held' : 'eaten')
                .children(run.held ? 'STAGE CLEAR' : 'GAME OVER'),
          ),
      ),
      h.div
        .class('stats')
        .children(
          h.span('SEED ', h.b(pad(seed, 5))),
          h.span('RUN HASH ', h.b(done ? run.hash : '······')),
        ),
      h.div
        .class('ctl')
        .children(
          h.button
            .attr('type', 'button')
            .on('click', SiteMessage.ClickedReplay())
            .children('▶ REPLAY SEED'),
          h.button
            .attr('type', 'button')
            .on('click', SiteMessage.ClickedNewSeed())
            .children('NEW SEED'),
        ),
      ...paras(h, WORKSHOP_SAYS),
      h.p.class('aside').children(WORKSHOP_STACK),
    )
})

const manor = SiteDef.fragment(
  (h, room: RoomId, typed: number, seed: number, turn: number) => {
  const line = RATTLES_SAYS[room]
  const shown = Str.slice(0, typed)(line)
  return h.main
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
        h.div
          .class('dlg')
          .children(
            sprite(h, 'rattles', 5.5),
            h.div(
              h.div.class('who').children('RATTLES'),
              h.div
                .class('txt')
                .attr('aria-live', 'polite')
                .children(shown.length < line.length ? `${shown}▌` : line),
            ),
          ),
        room === 'parlour' && parlour(h),
        room === 'trophy' && trophyRoom(h),
        room === 'workshop' && workshop(h, seed, turn),
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
    )
  },
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
  (h, zombies: ReadonlyArray<typeof Zombie.Type>) =>
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

const blueprint = SiteDef.fragment((h, flow: boolean, still: boolean) =>
  h.canvas
    .class('blueprint')
    .attr('aria-hidden', 'true')
    .onMount(
      GpuBlueprint({ flow, still }).pipe(
        Mount.map(supported => SiteMessage.StartedGpu({ supported })),
      ),
    ),
)

const home = SiteDef.fragment(
  (h, found: ReadonlyArray<EggId>, thesis: number) =>
  h.div
    .class('sheet')
    .children(
      topBar(h, found),
      hero(h, thesis),
      work(h),
      openSource(h),
      outside(h),
      footer(h),
    ),
)

// NOTE: the blueprint canvas, the horde and the toast sit outside the page,
// so they carry across routes and the GPU never restarts.
const siteView = SiteDef.view((h, model) =>
  h.div(
    blueprint(h, model.flow, h.props.reducedMotion),
    SiteRoute.match(model.route, {
      Home: () => home(h, model.found, model.thesis),
      Manor: () => manor(h, 'parlour', model.typed, model.seed, model.turn),
      ManorRoom: ({ params }) =>
        manor(h, params.room, model.typed, model.seed, model.turn),
      Rest: () => worlds(h),
      NotFound: () => notFound(h),
    }),
    horde(h, model.zombies),
    model.route._tag === 'Home'
      ? toastView(h, model.toast)
      : dock(h, model.toast, model.lastToast),
  ),
)

const roomColorOf = (
  route: SiteRoute,
): { readonly name: string; readonly color: string } =>
  SiteRoute.match(route, {
    Home: () => BLUEPRINT,
    Manor: () => MANOR,
    ManorRoom: () => MANOR,
    Rest: () => REST,
    NotFound: () => BLUEPRINT,
  })

const BLUEPRINT = { name: 'blueprint', color: '#0f3b78' }
const MANOR = { name: 'manor', color: '#141022' }
const REST = { name: 'rest', color: '#07090d' }

const titleOf = (route: SiteRoute): string =>
  SiteRoute.match(route, {
    Home: () => 'Tanner Scadden',
    Manor: () => 'The Manor · Tanner Scadden',
    ManorRoom: ({ params }) =>
      `${Str.capitalize(params.room)} · The Manor · Tanner Scadden`,
    Rest: () => 'Rest · Tanner Scadden',
    NotFound: () => 'Not found · Tanner Scadden',
  })

const typewriter = (
  route: SiteRoute,
  typed: number,
  reducedMotion: boolean,
) => {
  const room = roomOf(route)
  return (
    room !== null &&
    !reducedMotion &&
    typed < RATTLES_SAYS[room].length &&
    Subscription.make('typewriter', room, () =>
      Stream.tick(`${TYPE_MS} millis`).pipe(
        Stream.map(() => SiteMessage.TickedTypewriter()),
      ),
    )
  )
}

export const SiteNoDeps = SiteDef.make({
  init: $ => ({
    found: $.props.found,
    route: $.props.route,
    typed: typedFor($.props.route, $.props.reducedMotion),
    thesis: 0,
    recentKeys: [],
    zombies: [],
    toast: null,
    lastToast: '',
    toastSeq: 0,
    gpu: 'starting' as const,
    flow: false,
    seed: FIRST_SEED,
    turn: firstTurn($.props.reducedMotion),
  }),
  update: {
    ChangedRoute: changedRoute,
    Landed: $ => $.combine(awardFor($.model.route)),
    TickedTypewriter: $ =>
      $.evolve({ typed: typed => typed + CHARS_PER_TICK }),
    ClickedThesis: clickedThesis,
    PressedKey: pressedKey,
    CompletedMeasureViewport: summonHorde,
    TickedFrame: tickedFrame,
    ClickedZombie: ($, { id }) =>
      $.combine(
        $ => $.evolve({ zombies: Arr.filter($.model.zombies, z => z.id !== id) }),
        showToast('MUNCHED!'),
      ),
    CalledHello: award('console'),
    StartedPrint: award('print'),
    ClickedWebGpu: clickedWebGpu,
    StartedGpu: ($, { supported }) => $.evolve({ gpu: supported ? 'on' : 'off' }),
    ClickedReplay: $ => $.evolve({ turn: firstTurn($.props.reducedMotion) }),
    ClickedNewSeed: $ =>
      $.evolve({
        seed: nextSeed($.model.seed),
        turn: firstTurn($.props.reducedMotion),
      }),
    TickedReplay: $ =>
      $.evolve({ turn: turn => Math.min(turn + 1, TURNS) }),
    ExpiredToast: ($, { id }) =>
      $.model.toast?.id === id ? $.evolve({ toast: null }) : $.model,
  },
  subscriptions: ({ model, props }) => [
    Router.subscription(SiteRoute, model.route, route =>
      SiteMessage.ChangedRoute({ route }),
    ),
    // NOTE: init can't run Commands, so a page opened straight from its URL
    // finds its egg with this one message, once, right after mounting.
    Subscription.make('landed', Stream.make(SiteMessage.Landed())),
    HtmlSubscription.onDocument('keydown', ({ key, editable, repeat }) =>
      editable || repeat ? undefined : SiteMessage.PressedKey({ key }),
    ),
    devtools(SiteMessage.CalledHello()),
    beforePrint(SiteMessage.StartedPrint()),
    typewriter(model.route, model.typed, props.reducedMotion),
    roomOf(model.route) === 'workshop' &&
      model.turn < TURNS &&
      Subscription.make('replay', model.seed, () =>
        Stream.tick(`${REPLAY_MS} millis`).pipe(
          Stream.map(() => SiteMessage.TickedReplay()),
        ),
      ),
    model.zombies.length > 0 &&
      HtmlSubscription.onAnimationFrame(delta =>
        SiteMessage.TickedFrame({ delta }),
      ),
    model.toast !== null &&
      Subscription.make('toast', model.toast.id, id =>
        Stream.fromEffect(
          Effect.as(
            Effect.sleep(
              model.toast?.text === 'MUNCHED!' ? MUNCHED_MS : TOAST_MS,
            ),
            SiteMessage.ExpiredToast({ id }),
          ),
        ),
      ),
  ],
  head: $ => {
    const room = roomColorOf($.model.route)
    return [
      Head.title(titleOf($.model.route)),
      HtmlHead.lang('en'),
      // NOTE: the room's color goes on the document itself, so overscroll,
      // the space under short pages and the mobile toolbar all match it.
      HtmlHead.htmlData('data-room', room.name),
      HtmlHead.meta({ name: 'theme-color', content: room.color }),
    ]
  },
  view: siteView,
})

export const Site = SiteNoDeps.pipe(Component.provide(SaveEggs.layer))
