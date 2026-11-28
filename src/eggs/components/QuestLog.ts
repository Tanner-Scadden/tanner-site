import type { Html } from '@effect/ui/html'
import * as stylex from '@stylexjs/stylex'
import { Array as Arr, Boolean as Bool } from 'effect'

import { EGG_HINTS, EGG_NAMES } from '#content/eggs'
import { EGG_COUNT, EggId } from '#domain/Egg'

import { base } from '../../styles/base.ts'
import { sx } from '../../styles/sx.ts'
import { blueprint, media } from '../../styles/tokens.stylex.ts'
import { EggsState } from '../machines/Eggs.ts'

const styles = stylex.create({
  counter: {
    cursor: 'help',
    position: { default: 'relative', [media.phone]: 'static' },
    display: { [media.print]: 'none' },
  },
  got: { color: blueprint.hi },
  log: {
    display: {
      default: 'none',
      [stylex.when.ancestor(':hover')]: 'block',
      [stylex.when.ancestor(':focus-within')]: 'block',
    },
    position: 'absolute',
    top: { default: 'calc(100% + 12px)', [media.phone]: 'calc(100% + 8px)' },
    right: { default: -10, [media.phone]: 8 },
    left: { [media.phone]: 8 },
    zIndex: 20,
    width: { default: 'min(320px, calc(100vw - 32px))', [media.phone]: 'auto' },
    backgroundColor: blueprint.paper,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: blueprint.line,
    outlineWidth: 1,
    outlineStyle: 'solid',
    outlineColor: blueprint.line,
    outlineOffset: 3,
    boxShadow: `6px 6px 0 ${blueprint.shadow}`,
    paddingBlock: 14,
    paddingInline: 16,
    color: blueprint.line,
    letterSpacing: '.06em',
    cursor: 'default',
    textAlign: 'left',
    '::before': {
      content: '""',
      position: 'absolute',
      top: -14,
      left: 0,
      right: 0,
      height: 14,
    },
  },
  head: {
    fontSize: 10,
    letterSpacing: '.16em',
    color: blueprint.hi,
    paddingBottom: 10,
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomStyle: 'dashed',
    borderBottomColor: blueprint.faint,
  },
  list: { listStyle: 'none', display: 'grid', gap: 10 },
  egg: {
    display: 'grid',
    gridTemplateColumns: '18px 1fr',
    gap: 8,
    fontSize: 11,
    lineHeight: 1.5,
  },
  box: {
    display: 'inline-grid',
    placeItems: 'center',
    width: 18,
    height: 18,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: blueprint.dim,
    fontSize: 10,
    color: blueprint.dim,
  },
  boxDone: { borderColor: blueprint.hi, color: blueprint.hi },
  text: { display: 'grid', gap: 2 },
  textDone: { color: blueprint.hi, alignSelf: 'center' },
  unknown: { fontStyle: 'normal', color: blueprint.dim, letterSpacing: '.2em' },
  hint: { fontSize: 11, color: blueprint.line, letterSpacing: '.02em' },
})

export const EggCounter = <M>(h: Html.H<M>, eggs: EggsState) =>
  sx(h.span, base.focus, styles.counter, eggs.found.length > 0 && styles.got, stylex.defaultMarker())
    .attrs({ tabindex: '0', 'aria-describedby': 'quest-log' })
    .children(`EGGS ${eggs.found.length}/${EGG_COUNT}`, QuestLog(h, eggs))

const QuestLog = <M>(h: Html.H<M>, eggs: EggsState) =>
  sx(h.div, styles.log)
    .attrs({ id: 'quest-log', role: 'tooltip' })
    .children(
      sx(h.div, styles.head).children(
        EggsState.$match(eggs, {
          AllFound: () => 'ALL FOUND. THANKS FOR LOOKING AROUND.',
          Hunting: () => `QUEST LOG · ${eggs.found.length} OF ${EGG_COUNT} FOUND`,
        }),
      ),
      sx(h.ol, styles.list).children(
        ...Arr.map(EggId.literals, egg =>
          Bool.match(eggs.found.includes(egg), {
            onTrue: () =>
              sx(h.li, styles.egg).children(
                sx(h.b, styles.box, styles.boxDone).children('✓'),
                sx(h.span, styles.text, styles.textDone).children(EGG_NAMES[egg]),
              ),
            onFalse: () =>
              sx(h.li, styles.egg).children(
                sx(h.b, styles.box).children('?'),
                sx(h.span, styles.text).children(
                  sx(h.em, styles.unknown).children('???'),
                  sx(h.small, styles.hint).children(EGG_HINTS[egg]),
                ),
              ),
          }),
        ),
      ),
    )
