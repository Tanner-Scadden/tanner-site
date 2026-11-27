import type { Html } from '@effect/ui/html'
import * as stylex from '@stylexjs/stylex'
import { Array as Arr } from 'effect'

import { WORK } from '#content/home'

import { base } from '../../styles/base.ts'
import { sx } from '../../styles/sx.ts'
import { blueprint, fonts, media, widths } from '../../styles/tokens.stylex.ts'
import { WorkDrawing } from '../mounts/WorkDrawing.ts'
import { workMarker } from './work.stylex.ts'

export const Work = <M>(h: Html.H<M>, still: boolean) =>
  sx(h.div, styles.work, workMarker).children(
    sx(h.canvas, styles.canvas)
      .attr('aria-hidden', 'true')
      .onMount(WorkDrawing({ still })),
    ...Arr.map(WORK, (job, i) =>
      sx(h.div, styles.job, i === WORK.length - 1 && styles.lastJob)
        .attrs({ 'data-job': '', ...(job.wave === undefined ? {} : { 'data-wave': job.wave }) })
        .children(
          h.div(
            sx(h.small, styles.note).children(job.when),
            sx(h.strong, styles.name).children(
              sx(h.a, base.link, styles.link)
                .attrs({ href: job.href, target: '_blank', rel: 'noopener noreferrer' })
                .children(job.name),
            ),
            sx(h.small, styles.note).children(job.role),
          ),
          sx(h.div, styles.flow).children(
            Step(h, 'PROBLEM', job.problem, false),
            Arrow(h),
            Step(h, 'APPROACH', job.approach, false),
            Arrow(h),
            Step(h, 'RESULT', job.result, true),
          ),
        ),
    ),
  )

const Step = <M>(h: Html.H<M>, title: string, text: string, result: boolean) =>
  sx(h.div, styles.step, result && styles.result)
    .attr('data-step', '')
    .children(
      sx(h.small, styles.stepTitle).children(title),
      sx(h.p, styles.stepText, result && styles.resultText).children(text),
    )

const Arrow = <M>(h: Html.H<M>) =>
  sx(h.div, styles.arrow).attr('aria-hidden', 'true').children('→')

const styles = stylex.create({
  work: { position: 'relative', isolation: 'isolate' },
  canvas: {
    position: 'absolute',
    inset: -16,
    width: 'calc(100% + 32px)',
    height: 'calc(100% + 32px)',
    zIndex: -1,
    pointerEvents: 'none',
    display: {
      default: 'none',
      [stylex.when.ancestor('[data-gpu="on"]', workMarker)]: 'block',
      [media.print]: 'none',
    },
  },
  job: {
    display: 'grid',
    gridTemplateColumns: { default: '200px 1fr', [media.narrow]: '1fr' },
    gap: { default: 28, [media.narrow]: 12 },
    paddingBlock: 30,
    borderBottomWidth: 1,
    borderBottomStyle: 'dashed',
    borderBottomColor: blueprint.faint,
  },
  lastJob: { borderBottomStyle: 'none', paddingBottom: 0 },
  note: {
    display: 'block',
    fontSize: 10.5,
    letterSpacing: '.16em',
    color: blueprint.dim,
  },
  name: {
    display: 'block',
    fontFamily: fonts.display,
    fontWeight: 800,
    fontSize: 19,
    lineHeight: 1.1,
    fontStretch: widths.wide,
    textTransform: 'uppercase',
    marginBlock: 4,
  },
  link: {
    color: { default: 'inherit', ':hover': blueprint.hi, ':focus-visible': blueprint.hi },
    textDecoration: 'none',
    transitionProperty: 'color',
    transitionDuration: '.15s',
  },
  flow: {
    display: 'grid',
    gridTemplateColumns: { default: '1fr 24px 1fr 24px .8fr', [media.narrow]: '1fr' },
    alignItems: 'stretch',
  },
  step: {
    borderWidth: 1,
    borderStyle: 'solid',
    // On paper there's no GPU drawing, so the CSS borders come back.
    borderColor: {
      default: blueprint.rule,
      [stylex.when.ancestor('[data-gpu="on"]', workMarker)]: 'transparent',
      [media.print]: blueprint.rule,
    },
    paddingBlock: 14,
    paddingInline: 16,
  },
  result: {
    borderColor: {
      default: blueprint.hi,
      [stylex.when.ancestor('[data-gpu="on"]', workMarker)]: 'transparent',
      [media.print]: blueprint.rule,
    },
  },
  stepTitle: {
    display: 'block',
    fontSize: 10,
    letterSpacing: '.16em',
    color: blueprint.dim,
    marginBottom: 6,
  },
  stepText: { fontSize: 13 },
  resultText: { color: blueprint.hi },
  arrow: {
    display: 'grid',
    placeItems: 'center',
    color: blueprint.dim,
    transform: { default: null, [media.narrow]: 'rotate(90deg)' },
    height: { default: null, [media.narrow]: 22 },
  },
})
