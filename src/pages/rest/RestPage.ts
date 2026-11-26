import type { Html } from '@effect/ui/html'
import { Array as Arr } from 'effect'

import { REST_FACTS, SHOTS } from '#content/rest'

import { homeRoute, href } from '../../routes.ts'

// NOTE: /rest, the playing days. The gallery shows only shots with a photo.
export const RestPage = <M>(h: Html.H<M>) =>
  h.main
    .class('worlds')
    .attr('aria-label', 'Playing days')
    .children(
      h.div.class('wg').children(
        h.div
          .class('bar')
          .children(
            h.span('REPLAY · 2018 → 2022'),
            h.a.attr('href', href(homeRoute)).children('GG, BACK TO WORK'),
          ),
        h.h1('REST'),
        h.div
          .class('sub')
          .children(
            ...Arr.flatMap(REST_FACTS, (fact, i) => [
              i > 0 && ' ',
              h.span(i < REST_FACTS.length - 1 ? `${fact} ·` : fact),
            ]),
          ),
        h.div.class('shots').children(
          ...Arr.flatMap(SHOTS, shot =>
            shot.photo === undefined
              ? []
              : [
                  h.figure
                    .class('shot', shot.size)
                    .children(
                      h.img.attrs({
                        src: `/${shot.photo}`,
                        alt: `${shot.title}, ${shot.when}`,
                        loading: 'lazy',
                      }),
                      h.figcaption(h.span(shot.when), shot.title),
                    ),
                ],
          ),
        ),
      ),
    )
