import { Mount, UiSchema } from '@effect/ui'
import { Html } from '@effect/ui/html'
import * as stylex from '@stylexjs/stylex'
import { Array as Arr, Effect, Number as Num, Option, Queue, Schema, Stream } from 'effect'

import { base } from '../../styles/base.ts'
import { sx } from '../../styles/sx.ts'
import { blueprint, fonts, media, post } from '../../styles/tokens.stylex.ts'
import { isFull } from './clock.ts'
import { Controls, PlayerUnavailable, type Report, SLIDER_STEPS, Started } from './controls.ts'
import type { Scene, Variant } from './scene.ts'

// NOTE: a blog animation: a scene on a canvas, its controls, and a caption.
// `makeAnimation` turns a scene into a component a post drops in with
// `NetworkFigure(h, { key: 'network' })`.
//
// The controls are play and pause, replay, a time slider that plays on from
// wherever it's dropped, the time, and the scene's variants when it has more
// than one. A scene that takes interactions gets an INTERACT button after
// the time, the same in every figure; what it does is up to the scene, and
// it's disabled once the run has `interact.max` of them. If the canvas
// can't be drawn on at all, the controls go and the caption stays. The
// Model is only what the controls say; the drawing keeps the clock (see
// play.ts), and loads only once the canvas is on the page, WebGPU and all.
//
// The figure is marked `data-blueprint-quiet`, so the blueprint behind the
// page stops bending around the cursor while it's over the figure.

export const makeAnimation = <const Name extends string>(name: Name, scene: Scene) => {
  const Drawing = Mount.makeStream(
    `${name}Drawing`,
    { args: Controls },
    (canvas: HTMLCanvasElement, controls, changes) =>
      Stream.callback<Report>(queue =>
        Effect.tryPromise({
          try: () => import('./play.ts'),
          catch: cause => PlayerUnavailable.make({ cause }),
        }).pipe(
          Effect.flatMap(({ playScene }) =>
            playScene(canvas, scene, controls, changes, report => Queue.offer(queue, report)),
          ),
          // No WebGPU and no 2D canvas, or the player didn't load.
          Effect.catch(error =>
            Effect.logDebug(`No ${name}`, error).pipe(
              Effect.andThen(Queue.offer(queue, { _tag: 'Started' as const, drawable: false, still: false })),
            ),
          ),
        ),
      ),
  )

  const Message = UiSchema.TaggedEnum({
    ChoseVariant: { variant: Schema.String },
    ClickedPlay: {},
    ClickedReplay: {},
    ClickedInteract: {},
    // The reader clicked the drawing and it added an interaction.
    Aimed: {},
    // How many interactions the run has now.
    Counted: { interactions: Schema.Finite },
    MovedSlider: { value: Schema.String },
    Started: Started.fields,
  })

  const variantOf = (id: string): Variant =>
    Option.getOrElse(
      Arr.findFirst(scene.variants, variant => variant.id === id),
      () => Arr.headNonEmpty(scene.variants),
    )

  return Html.component({
    name,
    model: Schema.Struct({
      ...Controls.fields,
      // Until the drawing says otherwise, it can be drawn on.
      drawable: Schema.Boolean,
      still: Schema.Boolean,
      // How many interactions the run has, as the drawing last said.
      interactions: Schema.Finite,
    }),
    message: Message,
  }).make({
    init: () => ({
      variant: Arr.headNonEmpty(scene.variants).id,
      playing: true,
      seek: 0,
      seeks: 0,
      restarts: 0,
      interacts: 0,
      drawable: true,
      still: false,
      interactions: 0,
    }),
    update: {
      // Reduced motion starts paused, on the finished frame.
      Started: ($, { drawable, still }) =>
        $.evolve({ drawable: () => drawable, still: () => still, playing: playing => playing && !still }),
      ChoseVariant: ($, { variant }) =>
        variant === $.model.variant ? $.model : $.evolve({ variant: () => variant, playing: () => !$.model.still }),
      ClickedPlay: $ => $.evolve({ playing: playing => !playing }),
      ClickedReplay: $ =>
        $.evolve({ playing: () => true, seek: () => 0, seeks: seeks => seeks + 1, restarts: restarts => restarts + 1 }),
      // It plays on so the reader sees what they did, except under reduced
      // motion, where the still frame repaints with it. A full run drops
      // the press, so nothing changes. It counts the press at once, so a
      // quick second one can't slip past before the drawing says.
      ClickedInteract: $ =>
        isFull(scene, $.model.interactions)
          ? $.model
          : $.evolve({
              interacts: interacts => interacts + 1,
              interactions: interactions => interactions + 1,
              playing: playing => playing || !$.model.still,
            }),
      Aimed: $ => $.evolve({ playing: playing => playing || !$.model.still }),
      Counted: ($, { interactions }) => $.evolve({ interactions: () => interactions }),
      MovedSlider: ($, { value }) =>
        $.evolve({
          seek: () => Option.getOrElse(Num.parse(value), () => 0) / SLIDER_STEPS,
          seeks: seeks => seeks + 1,
        }),
    },
    view: (h, model) => {
      const shown = variantOf(model.variant)
      const alarm = shown.tone === 'alarm'
      return sx(h.figure, styles.figure)
        .attr('data-blueprint-quiet', '')
        .children(
          sx(h.canvas, styles.canvas)
            .attr('aria-hidden', 'true')
            .onMount(
              Drawing({
                variant: model.variant,
                playing: model.playing,
                seek: model.seek,
                seeks: model.seeks,
                restarts: model.restarts,
                interacts: model.interacts,
              }).pipe(
                Mount.map(report =>
                  report._tag === 'Aimed'
                    ? Message.Aimed()
                    : report._tag === 'Counted'
                      ? Message.Counted({ interactions: report.interactions })
                      : Message.Started({ drawable: report.drawable, still: report.still }),
                ),
              ),
            ),
          model.drawable &&
            sx(h.div, styles.controls).children(
              sx(h.button, base.button, styles.icon, styles.lead, alarm && styles.alarmLead)
                .attrs({
                  type: 'button',
                  'aria-label': model.playing ? 'Pause' : 'Play',
                  title: model.playing ? 'Pause' : 'Play',
                })
                .on('click', Message.ClickedPlay())
                .children(Icon(h, model.playing ? 'pause' : 'play')),
              sx(h.button, base.button, styles.icon)
                .attrs({ type: 'button', 'aria-label': 'Restart', title: 'Restart' })
                .on('click', Message.ClickedReplay())
                .children(Icon(h, 'restart')),
              sx(h.input, base.focus, styles.slider, alarm && styles.alarmSlider)
                .attrs({
                  type: 'range',
                  min: '0',
                  max: String(SLIDER_STEPS),
                  step: '1',
                  value: '0',
                  'aria-label': 'Time',
                })
                .on('input', ({ value }) => Message.MovedSlider({ value })),
              // The drawing keeps this up to date as it plays.
              sx(h.span, styles.clock).attrs({ 'data-clock': '', 'aria-hidden': 'true' }).children('0:00'),
              scene.interact !== undefined &&
                sx(h.button, base.button, styles.button, styles.interact)
                  .attrs({
                    type: 'button',
                    'aria-label': `Interact: ${scene.interact.hint}`,
                    title: scene.interact.hint,
                  })
                  .disabled(isFull(scene, model.interactions))
                  .on('click', Message.ClickedInteract())
                  .children(
                    sx(h.span, styles.glyph, styles.small, glyphs.interact).attr('aria-hidden', 'true'),
                    'INTERACT',
                  ),
              scene.variants.length > 1 &&
                sx(h.div, styles.variants)
                  .attrs({ role: 'group', 'aria-label': 'Version' })
                  .children(
                    ...Arr.map(scene.variants, variant =>
                      sx(
                        h.button,
                        base.button,
                        styles.button,
                        variant.id === model.variant && (variant.tone === 'alarm' ? styles.onAlarm : styles.on),
                      )
                        .attrs({ type: 'button', 'aria-pressed': String(variant.id === model.variant) })
                        .on('click', Message.ChoseVariant({ variant: variant.id }))
                        .children(variant.label),
                    ),
                  ),
            ),
          shown.caption !== '' && sx(h.figcaption, styles.caption).children(shown.caption),
        )
    },
  })
}

// The usual media icons (Material's, Apache 2.0): play, pause, replay
// from the start, and a tap for INTERACT. Each is a mask over the text
// colour, so it takes the button's colour and hover like a word would.

const Icon = <M>(h: Html.H<M>, icon: keyof typeof glyphs) =>
  sx(h.span, styles.glyph, glyphs[icon]).attr('aria-hidden', 'true')

const styles = stylex.create({
  // A frame in the text column, drawn like a detail on the sheet.
  figure: {
    marginBlock: '2em',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: blueprint.line,
    outlineWidth: 1,
    outlineStyle: 'solid',
    outlineColor: blueprint.faint,
    outlineOffset: 4,
  },
  canvas: { display: 'block', width: '100%', aspectRatio: '16 / 9', touchAction: 'pan-y' },
  controls: {
    display: { default: 'flex', [media.print]: 'none' },
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    paddingBlock: 8,
    paddingInline: 10,
    borderTopWidth: 1,
    borderTopStyle: 'dashed',
    borderTopColor: blueprint.faint,
  },
  button: {
    cursor: 'pointer',
    fontFamily: fonts.mono,
    fontWeight: 700,
    fontSize: 11,
    lineHeight: 1,
    letterSpacing: '.08em',
    color: { default: blueprint.dim, ':hover': blueprint.line, ':focus-visible': blueprint.line },
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: { default: blueprint.faint, ':hover': blueprint.dim, ':focus-visible': blueprint.dim },
    paddingBlock: 7,
    paddingInline: 10,
  },
  // A square icon button, a comfortable size to hit.
  icon: {
    display: 'grid',
    placeItems: 'center',
    flexShrink: 0,
    width: 32,
    height: 32,
    cursor: 'pointer',
    color: { default: blueprint.dim, ':hover': blueprint.line, ':focus-visible': blueprint.line },
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: { default: blueprint.faint, ':hover': blueprint.dim, ':focus-visible': blueprint.dim },
  },
  glyph: {
    display: 'block',
    width: 18,
    height: 18,
    backgroundColor: 'currentColor',
    maskRepeat: 'no-repeat',
    maskPosition: 'center',
    maskSize: 'contain',
  },
  // Play and pause leads the row, in gold.
  lead: { color: blueprint.hi, borderColor: { default: blueprint.hiSoft, ':hover': blueprint.hi } },
  // Elapsed and total, fixed-width digits so it doesn't jiggle.
  clock: {
    flexShrink: 0,
    fontFamily: fonts.mono,
    fontSize: 11,
    lineHeight: 'normal',
    fontVariantNumeric: 'tabular-nums',
    color: blueprint.dim,
    whiteSpace: 'nowrap',
  },
  // A word and an icon, the height of the icon buttons.
  // Faded once the run takes no more.
  interact: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
    height: 32,
    paddingBlock: 0,
    cursor: { default: 'pointer', ':disabled': 'default' },
    opacity: { default: 1, ':disabled': 0.4 },
  },
  small: { width: 14, height: 14 },
  alarmLead: { color: post.alarm, borderColor: post.alarm },
  on: { color: blueprint.hi, borderColor: blueprint.hi },
  onAlarm: { color: post.alarm, borderColor: post.alarm },
  slider: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 160,
    minWidth: 120,
    marginInline: 4,
    accentColor: blueprint.hi,
    cursor: 'pointer',
  },
  alarmSlider: { accentColor: post.alarm },
  variants: { display: 'flex', gap: 6 },
  caption: {
    paddingBlock: 10,
    paddingInline: 14,
    borderTopWidth: 1,
    borderTopStyle: 'dashed',
    borderTopColor: blueprint.faint,
    fontFamily: fonts.mono,
    fontSize: 12,
    lineHeight: 1.6,
    color: blueprint.dim,
  },
})

// Each glyph's path is written out in full: StyleX only takes literals.
const glyphs = stylex.create({
  play: {
    maskImage:
      "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M8 5v14l11-7z'/%3E%3C/svg%3E\")",
  },
  pause: {
    maskImage:
      "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M6 19h4V5H6v14zm8-14v14h4V5h-4z'/%3E%3C/svg%3E\")",
  },
  interact: {
    maskImage:
      "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M9 11.24V7.5C9 6.12 10.12 5 11.5 5S14 6.12 14 7.5v3.74c1.21-.81 2-2.18 2-3.74C16 5.01 13.99 3 11.5 3S7 5.01 7 7.5c0 1.56.79 2.93 2 3.74zm9.84 4.63l-4.54-2.26c-.17-.07-.35-.11-.54-.11H13v-6c0-.83-.67-1.5-1.5-1.5S10 6.67 10 7.5v10.74l-3.43-.72c-.08-.01-.15-.03-.24-.03-.31 0-.59.13-.79.33l-.79.8 4.94 4.94c.27.27.65.44 1.06.44h6.79c.75 0 1.33-.55 1.44-1.28l.75-5.27c.01-.07.02-.14.02-.2 0-.62-.38-1.16-.91-1.38z'/%3E%3C/svg%3E\")",
  },
  restart: {
    maskImage:
      "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z'/%3E%3C/svg%3E\")",
  },
})
