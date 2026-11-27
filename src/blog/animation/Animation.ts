import { Mount, UiSchema } from '@effect/ui'
import { Html } from '@effect/ui/html'
import * as stylex from '@stylexjs/stylex'
import { Array as Arr, Effect, Number as Num, Option, Queue, Schema, Stream } from 'effect'

import { base } from '../../styles/base.ts'
import { sx } from '../../styles/sx.ts'
import { blueprint, fonts, media, post } from '../../styles/tokens.stylex.ts'
import { Controls, PlayerUnavailable, SLIDER_STEPS, Started } from './controls.ts'
import type { Scene, Variant } from './scene.ts'

// NOTE: a blog animation: a scene on a canvas, its controls, and a caption.
// `makeAnimation` turns a scene into a component a post drops in with
// `NetworkFigure(h, { key: 'network' })`.
//
// The controls are play and pause, replay, a time slider, the scene's
// variants when it has more than one, and a tag that says what's drawing it:
// WEBGPU, CANVAS 2D, or STATIC for reduced motion. If the canvas can't be
// drawn on at all, the controls go and the caption stays. The Model is only
// what the controls say; the drawing keeps the clock (see play.ts), and
// loads only once the canvas is on the page, WebGPU and all.
//
// The figure is marked `data-blueprint-quiet`, so the blueprint behind the
// page stops bending around the cursor while it's over the figure.

const TAG: Record<Started['renderer'] | 'pending', string> = {
  pending: '',
  webgpu: 'WEBGPU',
  canvas: 'CANVAS 2D',
  none: '',
}

export const makeAnimation = <const Name extends string>(name: Name, scene: Scene) => {
  const Drawing = Mount.makeStream(
    `${name}Drawing`,
    { args: Controls },
    (canvas: HTMLCanvasElement, controls, changes) =>
      Stream.callback<Started>(queue =>
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
              Effect.andThen(Queue.offer(queue, { renderer: 'none' as const, still: false })),
            ),
          ),
        ),
      ),
  )

  const Message = UiSchema.TaggedEnum({
    ChoseVariant: { variant: Schema.String },
    ClickedPlay: {},
    ClickedReplay: {},
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
      renderer: Schema.Literals(['pending', 'webgpu', 'canvas', 'none']),
      still: Schema.Boolean,
    }),
    message: Message,
  }).make({
    init: () => ({
      variant: Arr.headNonEmpty(scene.variants).id,
      playing: true,
      seek: 0,
      seeks: 0,
      renderer: 'pending' as const,
      still: false,
    }),
    update: {
      // Reduced motion starts paused, on the finished frame.
      Started: ($, { renderer, still }) =>
        $.evolve({ renderer: () => renderer, still: () => still, playing: playing => playing && !still }),
      ChoseVariant: ($, { variant }) =>
        variant === $.model.variant ? $.model : $.evolve({ variant: () => variant, playing: () => !$.model.still }),
      ClickedPlay: $ => $.evolve({ playing: playing => !playing }),
      ClickedReplay: $ => $.evolve({ playing: () => true, seek: () => 0, seeks: seeks => seeks + 1 }),
      MovedSlider: ($, { value }) =>
        $.evolve({
          playing: () => false,
          seek: () => Option.getOrElse(Num.parse(value), () => 0) / SLIDER_STEPS,
          seeks: seeks => seeks + 1,
        }),
    },
    view: (h, model) => {
      const shown = variantOf(model.variant)
      const alarm = shown.tone === 'alarm'
      const tag = model.still && model.renderer !== 'none' ? 'STATIC' : TAG[model.renderer]
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
              }).pipe(Mount.map(report => Message.Started(report))),
            ),
          model.renderer !== 'none' &&
            sx(h.div, styles.controls).children(
              sx(h.button, base.button, styles.button, styles.lead, alarm && styles.alarmLead)
                .attrs({ type: 'button', 'aria-label': model.playing ? 'Pause' : 'Play' })
                .on('click', Message.ClickedPlay())
                .children(model.playing ? 'PAUSE' : 'PLAY'),
              sx(h.button, base.button, styles.button)
                .attrs({ type: 'button', 'aria-label': 'Replay' })
                .on('click', Message.ClickedReplay())
                .children('REPLAY'),
              sx(h.input, styles.slider, alarm && styles.alarmSlider)
                .attrs({
                  type: 'range',
                  min: '0',
                  max: String(SLIDER_STEPS),
                  step: '1',
                  value: '0',
                  'aria-label': 'Time',
                })
                .on('input', ({ value }) => Message.MovedSlider({ value })),
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
              tag !== '' && sx(h.small, styles.tag).children(tag),
            ),
          sx(h.figcaption, styles.caption).children(shown.caption),
        )
    },
  })
}

const styles = stylex.create({
  // Bleeds to the panel's edges, like a code listing.
  figure: {
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: post.rule,
    borderLeftWidth: { default: 1, [media.narrow]: 0 },
    borderRightWidth: { default: 1, [media.narrow]: 0 },
    marginLeft: { default: -24, [media.narrow]: -20 },
    marginRight: { default: -24, [media.narrow]: -20 },
    backgroundColor: post.codePaper,
  },
  canvas: { display: 'block', width: '100%', aspectRatio: '16 / 9', touchAction: 'pan-y' },
  controls: {
    display: { default: 'flex', [media.print]: 'none' },
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    paddingBlock: 10,
    paddingInline: 12,
    borderTopWidth: 1,
    borderTopStyle: 'solid',
    borderTopColor: post.rule,
  },
  button: {
    cursor: 'pointer',
    fontFamily: fonts.mono,
    fontWeight: 700,
    fontSize: 10.5,
    lineHeight: 'normal',
    letterSpacing: '.12em',
    color: { default: post.inkDim, ':hover': blueprint.hi },
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: { default: post.rule, ':hover': blueprint.hi },
    paddingBlock: 6,
    paddingInline: 10,
    transitionProperty: 'color, border-color',
    transitionDuration: '.15s',
    outlineWidth: { default: null, ':focus-visible': 2 },
    outlineStyle: { default: null, ':focus-visible': 'solid' },
    outlineColor: { default: null, ':focus-visible': blueprint.hi },
    outlineOffset: { default: null, ':focus-visible': 2 },
  },
  // Play and pause, a little wider so the label doesn't shift the row.
  lead: { minWidth: 70, color: blueprint.hi, borderColor: blueprint.hi },
  alarmLead: { color: post.alarm, borderColor: post.alarm },
  on: { color: blueprint.hi, borderColor: blueprint.hi },
  onAlarm: { color: post.alarm, borderColor: post.alarm },
  slider: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 140,
    minWidth: 120,
    marginInline: 6,
    accentColor: blueprint.hi,
    cursor: 'pointer',
  },
  alarmSlider: { accentColor: post.alarm },
  variants: { display: 'flex', gap: 6 },
  tag: {
    marginLeft: 'auto',
    fontFamily: fonts.mono,
    fontSize: 9.5,
    lineHeight: 'normal',
    letterSpacing: '.18em',
    color: post.inkDim,
  },
  caption: {
    paddingBlock: 10,
    paddingInline: 14,
    borderTopWidth: 1,
    borderTopStyle: 'dashed',
    borderTopColor: post.rule,
    fontFamily: fonts.mono,
    fontSize: 12,
    lineHeight: 1.6,
    letterSpacing: '.04em',
    color: post.inkDim,
  },
})
