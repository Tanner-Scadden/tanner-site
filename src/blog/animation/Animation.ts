import { Mount, UiSchema } from '@effect/ui'
import { Html } from '@effect/ui/html'
import * as stylex from '@stylexjs/stylex'
import { Array as Arr, Boolean as Bool, Effect, Number as Num, Option, Queue, Schema, Stream } from 'effect'

import { base } from '../../styles/base.ts'
import { sx } from '../../styles/sx.ts'
import { blueprint, fonts, media, post } from '../../styles/tokens.stylex.ts'
import { isFull } from './clock.ts'
import { Controls, PlayerUnavailable, Report, SLIDER_STEPS, Started } from './controls.ts'
import { type Scene, type Variant, rememberLast } from './scene.ts'

const loadPlayer = () => import('./play.ts')

export interface Look {
  readonly hero?: boolean
}

export const makeAnimation = <const Name extends string>(name: Name, scene: Scene, look: Look = {}) => {
  const hero = look.hero === true
  const Drawing = Mount.makeStream(
    `${name}Drawing`,
    { args: Controls },
    (canvas: HTMLCanvasElement, controls, changes) =>
      Stream.callback<Report>(queue =>
        Effect.tryPromise({
          try: loadPlayer,
          catch: cause => PlayerUnavailable.make({ cause }),
        }).pipe(
          Effect.flatMap(({ playScene }) =>
            playScene(canvas, scene, controls, changes, report => Queue.offer(queue, report)),
          ),
          Effect.catch(error =>
            Effect.logDebug(`No ${name}`, error).pipe(
              Effect.andThen(Queue.offer(queue, Report.cases.Started.make({ drawable: false, still: false }))),
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
    Aimed: {},
    Counted: { interactions: Schema.Finite },
    Ended: {},
    FoundEgg: {},
    MovedSlider: { value: Schema.String },
    Started: Started.fields,
  })

  const Events = UiSchema.TaggedEnum({
    FoundEgg: {},
  })

  const variantOf = (id: string): Variant =>
    Option.getOrElse(
      Arr.findFirst(scene.variants, variant => variant.id === id),
      () => Arr.headNonEmpty(scene.variants),
    )

  const component = Html.component({
    name,
    model: Schema.Struct({
      ...Controls.fields,
      drawable: Schema.Boolean,
      still: Schema.Boolean,
      interactions: Schema.Finite,
    }),
    message: Message,
    events: Events,
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
      Started: ($, { drawable, still }) =>
        $.evolve({ drawable: () => drawable, still: () => still, playing: playing => playing && !still }),
      ChoseVariant: ($, { variant }) => {
        if (variant === $.model.variant) return $.model
        return $.evolve({ variant: () => variant, playing: () => !$.model.still })
      },
      ClickedPlay: $ => $.evolve({ playing: playing => !playing }),
      ClickedReplay: $ =>
        $.evolve({ playing: () => true, seek: () => 0, seeks: seeks => seeks + 1, restarts: restarts => restarts + 1 }),
      ClickedInteract: $ => {
        if (isFull(scene, $.model.interactions)) return $.model
        return $.evolve({
          interacts: interacts => interacts + 1,
          interactions: interactions => interactions + 1,
          playing: playing => playing || !$.model.still,
        })
      },
      Aimed: $ => $.evolve({ playing: playing => playing || !$.model.still }),
      Counted: ($, { interactions }) => $.evolve({ interactions: () => interactions }),
      Ended: $ => $.evolve({ playing: () => false }),
      FoundEgg: $ => $.emit(Events.FoundEgg()),
      MovedSlider: ($, { value }) =>
        $.evolve({
          seek: () => Option.getOrElse(Num.parse(value), () => 0) / SLIDER_STEPS,
          seeks: seeks => seeks + 1,
        }),
    },
    view: (h, model) => {
      const shown = variantOf(model.variant)
      const alarm = shown.tone === 'alarm'
      return sx(h.figure, Bool.match(hero, { onTrue: () => styles.hero, onFalse: () => styles.figure }))
        .attr('data-blueprint-quiet', '')
        .children(
          sx(h.canvas, styles.canvas, scene.drag === true && styles.grab)
            .attrs(
              Option.match(Option.fromNullishOr(shown.description), {
                onNone: () => ({ 'aria-hidden': 'true' }),
                onSome: description => ({ role: 'img', 'aria-label': description }),
              }),
            )
            .onMount(
              Drawing({
                variant: model.variant,
                playing: model.playing,
                seek: model.seek,
                seeks: model.seeks,
                restarts: model.restarts,
                interacts: model.interacts,
              }).pipe(
                Mount.map(
                  Report.match({
                    Aimed: () => Message.Aimed(),
                    Counted: ({ interactions }) => Message.Counted({ interactions }),
                    Ended: () => Message.Ended(),
                    FoundEgg: () => Message.FoundEgg(),
                    Started: ({ drawable, still }) => Message.Started({ drawable, still }),
                  }),
                ),
              ),
            ),
          hero &&
            scene.variants.length > 1 &&
            sx(h.div, styles.variants, styles.heroVariants)
              .attrs({ role: 'group', 'aria-label': 'Version' })
              .children(
                ...Arr.map(scene.variants, variant =>
                  sx(h.button, base.button, styles.button, variant.id === model.variant && styles.on)
                    .attrs({ type: 'button', 'aria-pressed': String(variant.id === model.variant) })
                    .on('click', Message.ChoseVariant({ variant: variant.id }))
                    .children(variant.label),
                ),
              ),
          !hero &&
            model.drawable &&
            sx(h.div, styles.controls).children(
              sx(h.button, base.button, styles.icon, styles.lead, alarm && styles.alarmLead)
                .attrs({
                  type: 'button',
                  'aria-label': playLabel(model.playing),
                  title: playLabel(model.playing),
                })
                .on('click', Message.ClickedPlay())
                .children(Icon(h, playIcon(model.playing))),
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
              sx(h.span, styles.clock).attrs({ 'data-clock': '', 'aria-hidden': 'true' }).children('0:00'),
              Option.match(Option.fromNullishOr(scene.interact), {
                onNone: () => false,
                onSome: ({ hint }) =>
                  sx(h.button, base.button, styles.button, styles.interact)
                    .attrs({
                      type: 'button',
                      'aria-label': `Interact: ${hint}`,
                      title: hint,
                    })
                    .disabled(isFull(scene, model.interactions))
                    .on('click', Message.ClickedInteract())
                    .children(
                      sx(h.span, styles.glyph, styles.small, glyphs.interact).attr('aria-hidden', 'true'),
                      sx(h.span, styles.word).children('INTERACT'),
                    ),
              }),
              scene.variants.length > 1 &&
                sx(h.div, styles.variants)
                  .attrs({ role: 'group', 'aria-label': 'Version' })
                  .children(
                    ...Arr.map(scene.variants, variant =>
                      sx(
                        h.button,
                        base.button,
                        styles.button,
                        variant.id === model.variant &&
                          Bool.match(variant.tone === 'alarm', {
                            onTrue: () => styles.onAlarm,
                            onFalse: () => styles.on,
                          }),
                      )
                        .attrs({ type: 'button', 'aria-pressed': String(variant.id === model.variant) })
                        .on('click', Message.ChoseVariant({ variant: variant.id }))
                        .children(variant.label),
                    ),
                  ),
            ),
          shown.caption !== '' &&
            sx(h.figcaption, styles.caption, hero && styles.heroCaption).children(shown.caption),
        )
    },
  })
  const seconds = rememberLast((played: Scene): number => played.run(Arr.headNonEmpty(played.variants).id, 0).end)
  return Object.assign(component, { seconds: () => seconds(scene) })
}

const playLabel = (playing: boolean): string =>
  Bool.match(playing, { onTrue: () => 'Pause', onFalse: () => 'Play' })

const playIcon = (playing: boolean): keyof typeof glyphs =>
  Bool.match(playing, { onTrue: () => 'pause' as const, onFalse: () => 'play' as const })

const Icon = <M>(h: Html.H<M>, icon: keyof typeof glyphs) =>
  sx(h.span, styles.glyph, glyphs[icon]).attr('aria-hidden', 'true')

const styles = stylex.create({
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
  hero: { display: { default: 'block', [media.print]: 'none' }, margin: 0 },
  canvas: { display: 'block', width: '100%', aspectRatio: '16 / 9', touchAction: 'pan-y' },
  grab: { touchAction: 'none', cursor: 'grab' },
  controls: {
    display: { default: 'flex', [media.print]: 'none' },
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: { default: 8, [media.phone]: 6 },
    paddingBlock: 8,
    paddingInline: { default: 10, [media.phone]: 6 },
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
  lead: { color: blueprint.hi, borderColor: { default: blueprint.hiSoft, ':hover': blueprint.hi } },
  clock: {
    flexShrink: 0,
    fontFamily: fonts.mono,
    fontSize: 11,
    lineHeight: 'normal',
    fontVariantNumeric: 'tabular-nums',
    color: blueprint.dim,
    whiteSpace: 'nowrap',
  },
  interact: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    flexShrink: 0,
    width: { default: 'auto', [media.phone]: 32 },
    height: 32,
    paddingBlock: 0,
    paddingInline: { default: 10, [media.phone]: 0 },
    cursor: { default: 'pointer', ':disabled': 'default' },
    opacity: { default: 1, ':disabled': 0.4 },
  },
  small: { width: { default: 14, [media.phone]: 18 }, height: { default: 14, [media.phone]: 18 } },
  word: { display: { default: 'inline', [media.phone]: 'none' } },
  alarmLead: { color: post.alarm, borderColor: post.alarm },
  on: { color: blueprint.hi, borderColor: blueprint.hi },
  onAlarm: { color: post.alarm, borderColor: post.alarm },
  slider: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: { default: 160, [media.phone]: 0 },
    minWidth: { default: 120, [media.phone]: 28 },
    marginInline: { default: 4, [media.phone]: 2 },
    accentColor: blueprint.hi,
    cursor: 'pointer',
  },
  alarmSlider: { accentColor: post.alarm },
  variants: { display: 'flex', gap: 6 },
  heroVariants: { justifyContent: 'flex-end', marginTop: 8 },
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
  heroCaption: { paddingInline: 0, borderTopWidth: 0 },
})

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
