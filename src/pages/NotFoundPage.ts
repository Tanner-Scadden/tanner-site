import type { Html } from '@effect/ui/html'

import { homeRoute, href } from '../routes.ts'

// Any path no route claims.
export const NotFoundPage = <M>(h: Html.H<M>) =>
  h.main
    .class('sheet')
    .children(
      h.header
        .class('hero')
        .children(
          h.h1('Sheet not found'),
          h.p.class('role').children('404'),
          h.p
            .class('bio')
            .children(
              "This drawing isn't in the set. ",
              h.a.attr('href', href(homeRoute)).children('Back to the front page'),
              '.',
            ),
        ),
    )
