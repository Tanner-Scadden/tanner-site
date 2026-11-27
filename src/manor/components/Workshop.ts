import { Command, Component, Subscription, UiSchema } from '@effect/ui'
import { Html } from '@effect/ui/html'
import * as stylex from '@stylexjs/stylex'
import {
  Array as Arr,
  Context,
  Effect,
  Layer,
  Option,
  Schema,
  Stream,
  String as Str,
} from 'effect'
import { Machine } from 'effect-machine'

import { WORKSHOP_SAYS, WORKSHOP_STACK } from '#content/manor'

import { type Actor, started } from '../../lib/actor.ts'
import { base } from '../../styles/base.ts'
import { sx } from '../../styles/sx.ts'
import { arcade, fonts, manor, media } from '../../styles/tokens.stylex.ts'
import {
  WorkshopEvent,
  WorkshopState,
  turnOf,
  workshopMachine,
} from '../machines/Workshop.ts'
import {
  COLS,
  DOORS,
  ROWS,
  TURNS,
  type Shot,
  WAVES,
  type ZombieKind,
  runOf,
} from '../replay.ts'
import { panel } from '../panel.ts'
import { shot as shotVars } from './shot.stylex.ts'

export class WorkshopActor extends Context.Service<
  WorkshopActor,
  Actor<WorkshopState, WorkshopEvent>
>()('tanner-site/manor/components/Workshop/WorkshopActor') {
  static readonly layer = (props: WorkshopProps) =>
    Layer.effect(
      this,
      started(Machine.spawn(workshopMachine(props.reducedMotion))),
    )
}

export class SendReplay extends Command.Service<SendReplay>()(
  'manor/SendReplay',
  { args: { event: WorkshopEvent }, success: Component.Noop },
) {
  static readonly layer = this.toLayer(
    Effect.gen(function* () {
      const actor = yield* WorkshopActor
      return ({ event }: { readonly event: WorkshopEvent }) =>
        Effect.as(actor.send(event), Component.noop)
    }),
  )
}

const WorkshopProps = Schema.Struct({ reducedMotion: Schema.Boolean })
type WorkshopProps = typeof WorkshopProps.Type

const WorkshopMessage = UiSchema.TaggedEnum({
  ClickedReplay: {},
  ClickedNewSeed: {},
  ChangedReplay: { state: WorkshopState },
})

const WorkshopDef = Html.component({
  name: 'Workshop',
  props: WorkshopProps,
  model: WorkshopState,
  message: WorkshopMessage,
})

const shamble = stylex.keyframes({ to: { transform: 'translateY(-6%)' } })
const hit = stylex.keyframes({ '50%': { filter: 'brightness(5) saturate(0)' } })
const die = stylex.keyframes({
  '20%': { filter: 'brightness(5) saturate(0)' },
  '60%': { transform: 'rotate(90deg) translateX(30%)', opacity: 1 },
  to: { transform: 'rotate(90deg) translateX(30%)', opacity: 0 },
})
const idle = stylex.keyframes({ to: { backgroundPosition: '200% 0' } })
const pop = stylex.keyframes({ to: { opacity: 0 } })
const fly = stylex.keyframes({
  from: { left: shotVars.x0, top: shotVars.y0, opacity: 1 },
  '85%': { opacity: 1 },
  to: { left: shotVars.x1, top: shotVars.y1, opacity: 0 },
})
const blink = stylex.keyframes({ '50%': { opacity: 0 } })

const styles = stylex.create({
  screen: {
    marginTop: 4,
    marginInline: { default: 0, [media.narrow]: -10 },
    backgroundColor: arcade.screen,
    borderWidth: 4,
    borderStyle: 'solid',
    borderColor: arcade.screen,
    boxShadow: `6px 6px 0 ${manor.purple}`,
    position: 'relative',
    // Scanlines.
    '::after': {
      content: '""',
      position: 'absolute',
      inset: 0,
      pointerEvents: 'none',
      backgroundImage: `repeating-linear-gradient(${arcade.scanline} 0 1px, transparent 1px 3px)`,
    },
  },
  hud: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    paddingBlock: 6,
    paddingInline: 10,
    fontFamily: fonts.pixel,
    lineHeight: 'normal',
    fontWeight: 700,
    fontSize: 'clamp(10px, 1.8vw, 13px)',
    color: arcade.text,
  },
  hearts: { display: 'flex', gap: 4 },
  heart: {
    width: 12,
    height: 11,
    backgroundColor: manor.red,
    clipPath:
      'polygon(0 18%, 18% 0, 41% 0, 50% 18%, 59% 0, 82% 0, 100% 18%, 100% 45%, 50% 100%, 0 45%)',
  },
  heartLost: { backgroundColor: manor.plum },
  board: {
    position: 'relative',
    aspectRatio: '16 / 9',
    overflow: 'hidden',
    backgroundImage: `repeating-conic-gradient(${arcade.tile} 0 25%, ${arcade.tileDark} 0 50%)`,
    backgroundPosition: '0 0',
    backgroundSize: '12.5% 22.2222%',
  },
  doorway: (left: string, top: string) => ({
    position: 'absolute',
    left,
    top,
    width: '6.25%',
    height: '11.1111%',
    backgroundColor: arcade.doorway,
    boxShadow: `inset 0 0 0 3px ${manor.plum}`,
  }),
  // A survivor or a zombie, standing on its tile.
  token: (left: string, top: string, width: string) => ({
    position: 'absolute',
    left,
    top,
    width,
    transform: 'translate(-50%, -80%)',
    transitionProperty: 'left, top',
    transitionDuration: { default: '.45s', [media.reducedMotion]: '0s' },
    transitionTimingFunction: 'steps(3, end)',
  }),
  zombie: {
    display: 'block',
    width: '100%',
    height: 'auto',
    imageRendering: 'pixelated',
    animationName: { default: shamble, [media.reducedMotion]: 'none' },
    animationDuration: '.9s',
    animationTimingFunction: 'steps(2, end)',
    animationIterationCount: 'infinite',
  },
  brute: { animationDuration: '1.2s' },
  // Hit, it flashes white (its tile flashes, so the zombie can keep its
  // shamble), then shambles on once the flash is done.
  hit: {
    animationName: { default: hit, [media.reducedMotion]: 'none' },
    animationDuration: '.3s',
    animationDelay: '.15s',
    animationIterationCount: 1,
  },
  hitZombie: { animationDelay: '.45s' },
  dying: {
    display: { default: null, [media.reducedMotion]: 'none' },
  },
  dyingZombie: {
    animationName: die,
    animationDuration: '.6s',
    animationTimingFunction: 'steps(4, end)',
    animationDelay: '.15s',
    animationIterationCount: 1,
    animationFillMode: 'both',
  },
  survivor: (art: string) => ({
    aspectRatio: '8 / 12',
    backgroundImage: art,
    backgroundSize: '200% 100%',
    backgroundRepeat: 'no-repeat',
    imageRendering: 'pixelated',
    animationName: { default: idle, [media.reducedMotion]: 'none' },
    animationDuration: '1.2s',
    animationTimingFunction: 'steps(2, end)',
    animationIterationCount: 'infinite',
  }),
  facingLeft: { transform: 'translate(-50%, -80%) scaleX(-1)' },
  down: {
    animationName: 'none',
    transform: 'translate(-50%, -50%) rotate(90deg)',
    transitionProperty: 'none',
  },
  // Shots: a muzzle flash at the gun, a tracer to the zombie, then it drops.
  flash: (left: string, top: string) => ({
    position: 'absolute',
    left,
    top,
    width: '1.6%',
    aspectRatio: 1,
    transform: 'translate(-50%, -50%)',
    backgroundColor: arcade.muzzle,
    boxShadow: `0 0 0 2px ${arcade.tracer}`,
    zIndex: 2,
    display: { default: null, [media.reducedMotion]: 'none' },
    animationName: pop,
    animationDuration: '.12s',
    animationTimingFunction: 'steps(2, end)',
    animationFillMode: 'both',
  }),
  tracer: (x0: string, y0: string, x1: string, y1: string, angle: string) => ({
    [shotVars.x0]: x0,
    [shotVars.y0]: y0,
    [shotVars.x1]: x1,
    [shotVars.y1]: y1,
    position: 'absolute',
    left: shotVars.x1,
    top: shotVars.y1,
    width: '2.6%',
    height: '1.2%',
    transform: `translate(-50%, -50%) rotate(${angle})`,
    backgroundImage: `linear-gradient(90deg, transparent, ${arcade.tracer} 45%, ${arcade.muzzle})`,
    zIndex: 2,
    display: { default: null, [media.reducedMotion]: 'none' },
    animationName: fly,
    animationDuration: '.16s',
    animationTimingFunction: 'linear',
    animationFillMode: 'both',
  }),
  verdict: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    transform: 'translate(-50%, -50%)',
    fontFamily: fonts.pixel,
    lineHeight: 'normal',
    fontWeight: 700,
    fontSize: 'clamp(18px, 5vw, 40px)',
    textShadow: `4px 4px 0 ${arcade.screen}`,
    whiteSpace: 'nowrap',
    animationName: { default: blink, [media.reducedMotion]: 'none' },
    animationDuration: '1s',
    animationTimingFunction: 'steps(2, end)',
    animationIterationCount: 'infinite',
  },
  held: { color: arcade.held },
  eaten: { color: manor.red },
  stats: {
    display: 'flex',
    flexWrap: 'wrap',
    rowGap: 6,
    columnGap: 18,
    marginTop: 14,
    fontFamily: fonts.pixel,
    lineHeight: 'normal',
    fontSize: 11,
    color: manor.lilac,
  },
  stat: { color: manor.gold, fontWeight: 700 },
  controls: { display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14, marginBottom: 20 },
  button: {
    cursor: 'pointer',
    fontFamily: fonts.pixel,
    lineHeight: 'normal',
    fontWeight: 700,
    fontSize: 12,
    backgroundColor: { default: manor.plum, ':hover': manor.green },
    color: { default: manor.cream, ':hover': manor.ink },
    paddingBlock: 10,
    paddingInline: 14,
    boxShadow: {
      default: `4px 4px 0 ${manor.shadow}`,
      ':active': `2px 2px 0 ${manor.shadow}`,
    },
    transform: { default: null, ':active': 'translate(2px, 2px)' },
    outlineWidth: { default: null, ':focus-visible': 2 },
    outlineStyle: { default: null, ':focus-visible': 'solid' },
    outlineColor: { default: null, ':focus-visible': manor.gold },
    outlineOffset: { default: null, ':focus-visible': 2 },
  },
})

const pad = (n: number, width: number) => Str.padStart(width, '0')(String(n))

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

const onTile = (x: number, y: number, w: number) =>
  styles.token(
    `${((x + 0.5) / COLS) * 100}%`,
    `${((y + 0.5) / ROWS) * 100}%`,
    `${(w / (COLS * TILE_PX)) * 100}%`,
  )

const workshopView = WorkshopDef.view((h, state) => {
  const seed = state.seed
  const turn = turnOf(state)
  const run = runOf(seed)
  const frame = run.frames[Math.min(turn, TURNS)] ?? run.frames[0]!
  const done = state._tag === 'Over'
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
  return sx(h.section, panel.panel).children(
    sx(h.h2, panel.heading).children("HOW IT'S BUILT"),
    sx(h.div, styles.screen).children(
      sx(h.div, styles.hud)
        .attr('aria-live', 'polite')
        .children(
          h.span(`WAVE ${frame.wave}/${WAVES}`),
          sx(h.span, styles.hearts)
            .attr('aria-label', `${standing} of 4 survivors standing`)
            .children(
              ...Arr.map(frame.survivors, s =>
                sx(h.i, styles.heart, !s.up && styles.heartLost).attr('aria-hidden', 'true'),
              ),
            ),
          h.span(`KILLS ${pad(frame.downed, 2)}`),
        ),
      sx(h.div, styles.board)
        .attr('role', 'img')
        .attr(
          'aria-label',
          `Replay of seed ${seed}, wave ${frame.wave} of ${WAVES}: ${standing} survivors standing and ${frame.zombies.length} zombies in the room`,
        )
        .children(
          ...Arr.map(DOORS, d =>
            sx(h.span, styles.doorway(`${(d.x / COLS) * 100}%`, `${(d.y / ROWS) * 100}%`)),
          ),
          ...Arr.map(frame.survivors, s =>
            sx(
              h.div.key(`p${s.id}`),
              onTile(s.x, s.y, SURVIVOR_W),
              styles.survivor(`url(${ART}survivor-${s.id}.png)`),
              !s.up && styles.down,
              s.up && facesLeft(s.id, s.x, s.y) && styles.facingLeft,
            ),
          ),
          ...Arr.map(frame.zombies, z =>
            sx(
              h.div.key(`z${z.id}`),
              onTile(z.x, z.y, ZOMBIE_ART[z.kind].w),
              frame.hits.includes(z.id) && styles.hit,
            ).children(
              sx(
                h.img,
                styles.zombie,
                z.kind === 'brute' && styles.brute,
                frame.hits.includes(z.id) && styles.hitZombie,
              ).attrs({ src: ZOMBIE_ART[z.kind].src, alt: '' }),
            ),
          ),
          ...Arr.map(frame.splats, d =>
            sx(h.div.key(`d${d.id}`), onTile(d.x, d.y, ZOMBIE_ART[d.kind].w), styles.dying).children(
              sx(h.img, styles.zombie, styles.dyingZombie).attrs({
                src: ZOMBIE_ART[d.kind].src,
                alt: '',
              }),
            ),
          ),
          ...Arr.flatMap(frame.shots, shot => {
            const path = shotPath(shot, targetOf(shot))
            const from = pct(path.x0, path.y0)
            const to = pct(path.x1, path.y1)
            return [
              sx(h.span.key(`f${turn}-${shot.by}`), styles.flash(from.x, from.y)),
              sx(
                h.span.key(`b${turn}-${shot.by}`),
                styles.tracer(from.x, from.y, to.x, to.y, `${path.angle}deg`),
              ),
            ]
          }),
          done &&
            sx(h.div, styles.verdict, run.held ? styles.held : styles.eaten).children(
              run.held ? 'STAGE CLEAR' : 'GAME OVER',
            ),
        ),
    ),
    sx(h.div, styles.stats).children(
      h.span('SEED ', sx(h.b, styles.stat).children(pad(seed, 5))),
      h.span('RUN HASH ', sx(h.b, styles.stat).children(done ? run.hash : '······')),
    ),
    sx(h.div, styles.controls).children(
      sx(h.button, base.button, styles.button)
        .attr('type', 'button')
        .on('click', WorkshopMessage.ClickedReplay())
        .children('▶ REPLAY SEED'),
      sx(h.button, base.button, styles.button)
        .attr('type', 'button')
        .on('click', WorkshopMessage.ClickedNewSeed())
        .children('NEW SEED'),
    ),
    ...Arr.map(WORKSHOP_SAYS, line => sx(h.p, panel.text).children(line)),
    sx(h.p, panel.aside).children(WORKSHOP_STACK),
  )
})

const send = (event: WorkshopEvent) => SendReplay.make({ event })

export const WorkshopNoDeps = WorkshopDef.make({
  init: $ => workshopMachine($.props.reducedMotion).initial,
  update: {
    ClickedReplay: $ => $.run(send(WorkshopEvent.Replayed)),
    ClickedNewSeed: $ => $.run(send(WorkshopEvent.Reseeded)),
    ChangedReplay: (_, { state }) => state,
  },
  subscriptions: () => [
    Subscription.make(
      'replay',
      Stream.unwrap(
        WorkshopActor.use(actor => Effect.succeed(actor.changes)),
      ).pipe(Stream.map(state => WorkshopMessage.ChangedReplay({ state }))),
    ),
  ],
  view: workshopView,
})

export const Workshop = WorkshopNoDeps.pipe(
  Component.provide((props: WorkshopProps) =>
    Layer.provideMerge(SendReplay.layer, WorkshopActor.layer(props)),
  ),
)
