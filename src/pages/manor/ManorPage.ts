import type { Html } from '@effect/ui/html'
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

import { Dialogue } from '../../manor/components/Dialogue.ts'
import { Workshop } from '../../manor/components/Workshop.ts'
import { homeRoute, href, restRoute, roomRoute } from '../../routes.ts'

// NOTE: the hidden Manor, at /manor (the parlour) and /manor/:room. Rattles
// greets each room, and the Workshop runs its own replay.
export const ManorPage = <M>(
  h: Html.H<M>,
  options: { readonly room: RoomId; readonly reducedMotion: boolean },
) => {
  const { room, reducedMotion } = options
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
                  Sprite(h, ROOM_SPRITES[r], 4.5),
                ),
            ),
          ),
        Dialogue(h, { key: room, props: { room, reducedMotion } }),
        room === 'parlour' && Parlour(h),
        room === 'trophy' && TrophyRoom(h),
        room === 'workshop' && Workshop(h, { props: { reducedMotion } }),
        h.div
          .class('play')
          .children(
            h.a
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
  Arr.map(lines, line => h.p(line))

const Parlour = <M>(h: Html.H<M>) =>
  h.section
    .class('panel')
    .children(
      h.h2('THE GAME'),
      ...Paragraphs(h, PARLOUR_SAYS),
      h.dl
        .class('facts')
        .children(
          ...Arr.map(PARLOUR_FACTS, fact => h.div(h.dt(fact.label), h.dd(fact.value))),
        ),
    )

const TrophyRoom = <M>(h: Html.H<M>) =>
  h.section
    .class('panel')
    .children(
      h.h2('WHERE IT CAME FROM'),
      ...Paragraphs(h, TROPHY_SAYS),
      h.ul
        .class('shelf')
        .attr('aria-label', 'The games that made this one')
        .children(
          ...Arr.map(SHELF, plaque =>
            h.li(Sprite(h, 'trophy', 3.5), h.b(plaque.name), h.span(plaque.note)),
          ),
        ),
      h.p.class('aside').children(h.a.attr('href', href(restRoute)).children(TROPHY_REST)),
    )
