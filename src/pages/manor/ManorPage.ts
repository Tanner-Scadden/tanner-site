import type { Html } from '@effect/ui/html'
import * as stylex from '@stylexjs/stylex'
import { Array as Arr } from 'effect'

import { type SpriteName, Sprite } from '#components/Sprite'
import {
  MUNCH_MANOR_URL,
  PARLOUR_FACTS,
  PARLOUR_SAYS,
  ROOM_NAMES,
  ROOM_TAGS,
  SHELF,
  TROPHY_REST,
  TROPHY_SAYS,
} from '#content/manor'
import { ROOMS, type RoomId } from '#domain/Room'

import { RattlesBox } from '../../manor/components/RattlesBox.ts'
import { Workshop } from '../../manor/components/Workshop.ts'
import type { RattlesState } from '../../manor/machines/Rattles.ts'
import { panel } from '../../manor/panel.ts'
import { homeRoute, href, restRoute, roomRoute } from '../../routes.ts'
import { base } from '../../styles/base.ts'
import { sx } from '../../styles/sx.ts'
import { fonts, manor, media } from '../../styles/tokens.stylex.ts'

const quake = stylex.keyframes({
  '25%': { transform: 'translate(-6px, 2px)' },
  '50%': { transform: 'translate(5px, -3px)' },
  '75%': { transform: 'translate(-3px, 4px)' },
})

const styles = stylex.create({
  page: {
    display: 'block',
    minHeight: stylex.firstThatWorks('100dvh', '100vh'),
    backgroundColor: manor.night,
    color: manor.cream,
    fontFamily: fonts.terminal,
    fontSize: 21,
    lineHeight: 1.25,
  },
  wrap: {
    maxWidth: 880,
    marginInline: 'auto',
    paddingTop: 24,
    paddingInline: 16,
    paddingBottom: 96,
  },
  // Cut Rattles off too many times and the Manor breaks for a moment.
  quaking: {
    animationName: { default: quake, [media.reducedMotion]: 'none' },
    animationDuration: '.5s',
    animationTimingFunction: 'steps(4, end)',
  },
  head: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    fontFamily: fonts.pixel,
    lineHeight: 'normal',
    fontSize: 12,
    color: manor.lilac,
  },
  back: {
    cursor: 'pointer',
    textDecoration: 'none',
    fontFamily: fonts.pixel,
    lineHeight: 'normal',
    fontSize: 12,
    fontWeight: 700,
    backgroundColor: manor.green,
    color: manor.ink,
    paddingBlock: 8,
    paddingInline: 12,
    boxShadow: `4px 4px 0 ${manor.shadow}`,
    outlineColor: { default: null, ':focus-visible': manor.gold },
  },
  title: {
    fontFamily: fonts.pixel,
    fontWeight: 700,
    fontSize: 'clamp(24px, 5vw, 44px)',
    lineHeight: 1,
    color: manor.pale,
    textShadow: `4px 4px 0 ${manor.purple}`,
    textAlign: 'center',
    marginTop: 28,
    marginBottom: 22,
  },
  rooms: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 6,
    padding: 6,
    backgroundColor: manor.ink,
  },
  roomsBroken: { backgroundColor: manor.broken },
  room: {
    cursor: 'pointer',
    textDecoration: 'none',
    color: 'inherit',
    backgroundColor: { default: manor.plum, ':hover': manor.plumLit },
    minHeight: { default: 140, [media.narrow]: 0 },
    padding: 16,
    paddingTop: { default: null, [media.narrow]: 10 },
    paddingInline: { default: null, [media.narrow]: 4 },
    paddingBottom: { default: null, [media.narrow]: 8 },
    position: 'relative',
    display: 'flex',
    flexDirection: { default: null, [media.narrow]: 'column' },
    alignItems: { default: 'flex-end', [media.narrow]: 'center' },
    justifyContent: { default: null, [media.narrow]: 'space-between' },
    gap: { default: 10, [media.narrow]: 4 },
    textAlign: { default: null, [media.narrow]: 'center' },
    outlineWidth: { default: null, ':focus-visible': 4 },
    outlineColor: { default: null, ':focus-visible': manor.green },
    outlineOffset: { default: null, ':focus-visible': -4 },
  },
  roomOn: {
    backgroundColor: manor.plumLit,
    outlineWidth: 4,
    outlineStyle: 'solid',
    outlineColor: { default: manor.gold, ':focus-visible': manor.green },
    outlineOffset: -4,
  },
  // The doors jam and hang crooked until he calms down.
  roomBroken: { pointerEvents: 'none', filter: 'saturate(.3) brightness(.7)' },
  roomName: {
    fontFamily: fonts.pixel,
    fontWeight: 700,
    fontSize: { default: 12, [media.narrow]: 10 },
    lineHeight: { default: 'normal', [media.narrow]: 1.2 },
    color: manor.gold,
    position: { default: 'absolute', [media.narrow]: 'static' },
    top: 12,
    left: 16,
  },
  roomTag: {
    fontFamily: fonts.pixel,
    lineHeight: 'normal',
    fontSize: 10,
    color: manor.lilac,
    position: 'absolute',
    top: 30,
    left: 16,
    right: 16,
    display: { default: null, [media.narrow]: 'none' },
  },
  roomTagOn: { color: manor.cream },
  roomSprite: {
    transform: { default: null, [media.narrow]: 'scale(.55)' },
    marginBlock: { default: null, [media.narrow]: -16 },
  },
  play: {
    marginTop: 26,
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    flexWrap: 'wrap',
    color: manor.lilac,
  },
  playLink: {
    fontFamily: fonts.pixel,
    lineHeight: 'normal',
    fontSize: 14,
    fontWeight: 700,
    backgroundColor: { default: manor.gold, ':hover': manor.green },
    color: manor.ink,
    paddingBlock: 12,
    paddingInline: 16,
    boxShadow: `4px 4px 0 ${manor.purple}`,
    textDecoration: 'none',
    outlineColor: { default: null, ':focus-visible': manor.cream },
    outlineOffset: { default: null, ':focus-visible': 3 },
  },
  facts: {
    display: 'grid',
    gridTemplateColumns: { default: 'repeat(4, 1fr)', [media.narrow]: '1fr 1fr' },
    gap: 6,
    marginTop: 18,
  },
  fact: { backgroundColor: manor.plum, paddingBlock: 10, paddingInline: 12 },
  factLabel: { fontFamily: fonts.pixel, fontSize: 10, color: manor.lilac, lineHeight: 'normal' },
  factValue: { fontSize: 24, color: manor.pale },
  shelf: {
    listStyle: 'none',
    display: 'grid',
    gridTemplateColumns: { default: 'repeat(3, 1fr)', [media.narrow]: '1fr' },
    gap: 6,
    marginTop: 20,
    borderBottomWidth: 8,
    borderBottomStyle: 'solid',
    borderBottomColor: manor.wood,
  },
  plaque: {
    backgroundColor: manor.plum,
    paddingTop: 16,
    paddingInline: 12,
    paddingBottom: 12,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
    textAlign: 'center',
  },
  plaqueName: { fontFamily: fonts.pixel, fontSize: 11, fontWeight: 700, color: manor.gold, lineHeight: 'normal' },
  plaqueNote: { fontSize: 19, color: manor.lilac, lineHeight: 1.1 },
})

// How each room's door hangs while the Manor is broken.
const crooked = stylex.create({
  parlour: { transform: 'rotate(-4deg) translateY(6px)' },
  trophy: { transform: 'rotate(3deg) translateY(-4px)' },
  workshop: { transform: 'rotate(-2deg) translate(4px, 10px)' },
})

export const ManorPage = <M>(
  h: Html.H<M>,
  options: {
    readonly room: RoomId
    readonly rattles: RattlesState
    readonly reducedMotion: boolean
  },
) => {
  const { room, rattles, reducedMotion } = options
  const upset = rattles._tag === 'Upset'
  return sx(h.main, styles.page)
    .attr('aria-label', 'Hidden room')
    .children(
      sx(h.div, styles.wrap, upset && styles.quaking).children(
        sx(h.div, styles.head).children(
          h.span('SCADDEN MANOR'),
          sx(h.a, base.link, styles.back).attr('href', href(homeRoute)).children('BACK'),
        ),
        sx(h.h1, styles.title).children('YOU FOUND THE MANOR'),
        sx(h.nav, styles.rooms, upset && styles.roomsBroken)
          .attr('aria-label', 'Rooms')
          .children(
            ...Arr.map(ROOMS, r =>
              sx(
                h.a,
                base.link,
                styles.room,
                r === room && styles.roomOn,
                upset && styles.roomBroken,
                upset && crooked[r],
              )
                .attr('href', href(roomRoute(r)))
                .attr('aria-current', r === room ? 'page' : 'false')
                .attr('aria-disabled', upset ? 'true' : 'false')
                .children(
                  sx(h.b, styles.roomName).children(ROOM_NAMES[r]),
                  sx(h.small, styles.roomTag, r === room && styles.roomTagOn).children(
                    ROOM_TAGS[r],
                  ),
                  Sprite(h, ROOM_SPRITES[r], 4.5, styles.roomSprite),
                ),
            ),
          ),
        RattlesBox(h, rattles),
        room === 'parlour' && Parlour(h),
        room === 'trophy' && TrophyRoom(h),
        room === 'workshop' && Workshop(h, { props: { reducedMotion } }),
        sx(h.div, styles.play).children(
          sx(h.a, base.link, styles.playLink)
            .attrs({ href: MUNCH_MANOR_URL, target: '_blank', rel: 'noopener' })
            .children('PLAY MUNCH MANOR ↗'),
          h.span('Free, in your browser, up to 4 players.'),
        ),
      ),
    )
}

const ROOM_SPRITES: Record<RoomId, SpriteName> = {
  parlour: 'tanner',
  trophy: 'trophy',
  workshop: 'zombie',
}

const Paragraphs = <M>(h: Html.H<M>, lines: ReadonlyArray<string>) =>
  Arr.map(lines, line => sx(h.p, panel.text).children(line))

const Parlour = <M>(h: Html.H<M>) =>
  sx(h.section, panel.panel).children(
    sx(h.h2, panel.heading).children('THE GAME'),
    ...Paragraphs(h, PARLOUR_SAYS),
    sx(h.dl, styles.facts).children(
      ...Arr.map(PARLOUR_FACTS, fact =>
        sx(h.div, styles.fact).children(
          sx(h.dt, styles.factLabel).children(fact.label),
          sx(h.dd, styles.factValue).children(fact.value),
        ),
      ),
    ),
  )

const TrophyRoom = <M>(h: Html.H<M>) =>
  sx(h.section, panel.panel).children(
    sx(h.h2, panel.heading).children('WHERE IT CAME FROM'),
    ...Paragraphs(h, TROPHY_SAYS),
    sx(h.ul, styles.shelf)
      .attr('aria-label', 'The games that made this one')
      .children(
        ...Arr.map(SHELF, plaque =>
          sx(h.li, styles.plaque).children(
            Sprite(h, 'trophy', 3.5),
            sx(h.b, styles.plaqueName).children(plaque.name),
            sx(h.span, styles.plaqueNote).children(plaque.note),
          ),
        ),
      ),
    sx(h.p, panel.aside).children(
      sx(h.a, base.link, panel.asideLink).attr('href', href(restRoute)).children(TROPHY_REST),
    ),
  )
