import { Mount } from '@effect/ui'
import type { Html } from '@effect/ui/html'
import * as stylex from '@stylexjs/stylex'
import { Boolean as Bool } from 'effect'

import { HOUSE } from '#content/home'

import { base } from '../../styles/base.ts'
import { sx } from '../../styles/sx.ts'
import { blueprint, media } from '../../styles/tokens.stylex.ts'
import { HouseDrawing } from '../mounts/HouseDrawing.ts'
import { houseMarker } from './house.stylex.ts'

type RoomName = 'library' | 'work' | 'oss' | 'outside'

const WEBGPU = typeof navigator !== 'undefined' && 'gpu' in navigator

export const House = <M>(h: Html.H<M>, still: boolean, played: M, blogOpen: boolean) =>
  sx(h.figure, styles.house, houseMarker)
    .attrs(Bool.match(WEBGPU, { onTrue: () => ({ 'data-gpu': 'starting' }), onFalse: () => ({}) }))
    .children(
    sx(h.canvas, styles.canvas)
      .attr('aria-hidden', 'true')
      .onMount(HouseDrawing({ still }).pipe(Mount.map((): M => played))),
    sx(h.small, styles.sheetNo, styles.pencilled)
      .attr('aria-hidden', 'true')
      .children(HOUSE.sheet),
    sx(h.nav, styles.plan)
      .attrs({ 'aria-label': 'Floor plan of this page', 'data-plan': '' })
      .children(
        Bool.match(blogOpen, {
          onTrue: () => Room(h, 'library', '#blog'),
          onFalse: () =>
            sx(h.div, styles.room, rooms.library)
              .attrs({ 'data-room': 'library', 'aria-hidden': 'true' })
              .children(sx(h.b, styles.name, styles.pencilled).children(HOUSE.rooms.library.name)),
        }),
        Room(h, 'work', '#work'),
        Room(h, 'oss', '#oss'),
        Room(h, 'outside', '#personal-life'),
        sx(h.div, styles.room, styles.locked)
          .attrs({ 'data-room': 'locked', 'aria-hidden': 'true' })
          .children(
            sx(h.b, styles.name, styles.pencilled).children(HOUSE.rooms.locked.name),
            sx(h.small, styles.note, styles.pencilled).children(HOUSE.rooms.locked.note),
          ),
      ),
  )

const Room = <M>(h: Html.H<M>, name: RoomName, target: string) =>
  sx(h.a, base.link, styles.room, styles.link, rooms[name])
    .attrs({ href: target, 'data-room': name })
    .children(sx(h.b, styles.name, styles.pencilled).children(HOUSE.rooms[name].name))

const styles = stylex.create({
  house: {
    position: 'relative',
    isolation: 'isolate',
    margin: 0,
    display: { [media.print]: 'none' },
  },
  canvas: {
    position: 'absolute',
    inset: { default: -40, [media.narrow]: -16 },
    width: { default: 'calc(100% + 80px)', [media.narrow]: 'calc(100% + 32px)' },
    height: { default: 'calc(100% + 80px)', [media.narrow]: 'calc(100% + 32px)' },
    zIndex: -1,
    pointerEvents: 'none',
    display: {
      default: 'none',
      [stylex.when.ancestor('[data-gpu="on"]', houseMarker)]: 'block',
    },
  },
  pencilled: {
    opacity: {
      default: 1,
      [stylex.when.ancestor('[data-gpu="starting"]', houseMarker)]: 0,
      [stylex.when.ancestor('[data-gpu="on"][data-drafting]', houseMarker)]: 0,
    },
    transitionProperty: 'opacity',
    transitionDuration: {
      default: '.6s',
      [stylex.when.ancestor('[data-gpu="starting"]', houseMarker)]: '0s',
      [stylex.when.ancestor('[data-gpu="on"][data-drafting]', houseMarker)]: '0s',
      [media.reducedMotion]: '0s',
    },
    transitionTimingFunction: 'ease-out',
  },
  sheetNo: {
    display: 'block',
    textAlign: 'center',
    fontSize: 9,
    letterSpacing: '.16em',
    color: blueprint.dim,
    marginBottom: 8,
  },
  plan: {
    display: 'grid',
    gridTemplateColumns: '85fr 105fr 35fr 75fr',
    gridTemplateRows: '1.3fr 1fr',
    aspectRatio: '28 / 19',
    borderWidth: 2.5,
    borderStyle: 'solid',
    borderColor: {
      default: blueprint.line,
      [stylex.when.ancestor('[data-gpu="starting"]', houseMarker)]: 'transparent',
      [stylex.when.ancestor('[data-gpu="on"]', houseMarker)]: 'transparent',
    },
    position: 'relative',
    transformOrigin: {
      [stylex.when.ancestor('[data-gpu="on"]', houseMarker)]: '0 0',
    },
    willChange: {
      [stylex.when.ancestor('[data-gpu="on"]', houseMarker)]: 'transform',
    },
    '::after': {
      content: '""',
      position: 'absolute',
      bottom: -3,
      left: '28%',
      width: 30,
      height: 4,
      backgroundColor: blueprint.paper,
      display: {
        default: 'block',
        [stylex.when.ancestor('[data-gpu="starting"]', houseMarker)]: 'none',
        [stylex.when.ancestor('[data-gpu="on"]', houseMarker)]: 'none',
      },
    },
  },
  room: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    padding: 8,
    textAlign: 'center',
    color: 'inherit',
    textDecoration: 'none',
    borderStyle: 'solid',
    borderWidth: 0,
    borderColor: {
      default: blueprint.line,
      [stylex.when.ancestor('[data-gpu="starting"]', houseMarker)]: 'transparent',
      [stylex.when.ancestor('[data-gpu="on"]', houseMarker)]: 'transparent',
    },
    transitionProperty: 'color, background-color',
    transitionDuration: '.15s',
  },
  link: {
    color: { default: 'inherit', ':hover': blueprint.hi, ':focus-visible': blueprint.hi },
    backgroundColor: { ':hover': blueprint.wash, ':focus-visible': blueprint.wash },
    outlineStyle: { ':focus-visible': 'dashed' },
    outlineOffset: { ':focus-visible': -4 },
  },
  locked: { gridColumn: 4, color: blueprint.hi },
  name: { fontSize: { default: 12, [media.narrow]: 10 }, letterSpacing: '.08em' },
  note: { fontSize: 8, letterSpacing: '.12em', color: blueprint.hi },
})

const rooms = stylex.create({
  library: { gridColumn: 1, borderRightWidth: 1.5, borderBottomWidth: 1.5 },
  work: { gridColumn: 2, borderRightWidth: 1.5, borderBottomWidth: 1.5 },
  oss: { gridColumnStart: 3, gridColumnEnd: 5, borderBottomWidth: 1.5 },
  outside: {
    gridColumnStart: 1,
    gridColumnEnd: 4,
    borderRightWidth: 1.5,
    justifyContent: 'flex-start',
    paddingTop: 14,
  },
})
