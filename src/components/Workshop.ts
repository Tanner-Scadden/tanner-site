import { Command, Component, Subscription, UiSchema } from '@effect/ui'
import { Html } from '@effect/ui/html'
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

import { WORKSHOP_SAYS, WORKSHOP_STACK } from '../content'
import { type Actor, started } from '../machines/actor'
import {
  WorkshopEvent,
  WorkshopState,
  turnOf,
  workshopMachine,
} from '../machines/Workshop'
import {
  COLS,
  DOORS,
  ROWS,
  TURNS,
  type Shot,
  WAVES,
  type ZombieKind,
  runOf,
} from '../replay'

// NOTE: the replay lives as long as this component: each visit to the
// Workshop mounts it and starts the first seed over.
export class WorkshopActor extends Context.Service<
  WorkshopActor,
  Actor<WorkshopState, WorkshopEvent>
>()('tanner-site/components/Workshop/WorkshopActor') {
  static readonly layer = (props: WorkshopProps) =>
    Layer.effect(
      this,
      started(Machine.spawn(workshopMachine(props.reducedMotion))),
    )
}

export class SendReplay extends Command.Service<SendReplay>()(
  'site/SendReplay',
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

const pad = (n: number, width: number) => Str.padStart(width, '0')(String(n))

// NOTE: the board is a little arcade screen. The survivors are the game's
// four default crew and the zombies are its own sprites, all drawn at one
// shared pixel size: a tile is 10 game pixels across.
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
            .on('click', WorkshopMessage.ClickedReplay())
            .children('▶ REPLAY SEED'),
          h.button
            .attr('type', 'button')
            .on('click', WorkshopMessage.ClickedNewSeed())
            .children('NEW SEED'),
        ),
      ...Arr.map(WORKSHOP_SAYS, line => h.p(line)),
      h.p.class('aside').children(WORKSHOP_STACK),
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
