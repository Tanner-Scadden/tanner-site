import type { Html } from '@effect/ui/html'

import { sheet } from '#components/Sheet'

import { homeRoute, href } from '../routes.ts'
import { sx } from '../styles/sx.ts'

// Any path no route claims.
export const NotFoundPage = <M>(h: Html.H<M>) =>
  sx(h.main, sheet.sheet).children(
    sx(h.header, sheet.hero, sheet.last).children(
      sx(h.h1, sheet.title).children('Sheet not found'),
      sx(h.p, sheet.role).children('404'),
      h.p(
        "This drawing isn't in the set. ",
        h.a.attr('href', href(homeRoute)).children('Back to the front page'),
        '.',
      ),
    ),
  )
