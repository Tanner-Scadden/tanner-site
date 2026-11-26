import type { Html } from '@effect/ui/html'

import { homeRoute, href } from '../../routes.ts'
import type { ToastState } from '../machines/Toast.ts'

// The front page's toast: it shows while there is news, then fades.
export const Toast = <M>(h: Html.H<M>, toast: ToastState) =>
  h.div
    .class('toast', toast._tag === 'Showing' && 'on')
    .attr('role', 'status')
    .children(toast._tag === 'Showing' ? toast.text : '')

// NOTE: on a hidden page the toast never leaves. It floats at the bottom as
// the way home, and shows the latest news (like EGG FOUND) while there is
// some, then turns back into BACK.
export const Dock = <M>(h: Html.H<M>, toast: ToastState) => {
  const text = toast._tag === 'Showing' ? toast.text : toast.last
  return h.a
    .class('toast', 'on', 'dock', toast._tag === 'Showing' && 'news')
    .attrs({ href: href(homeRoute), 'aria-label': 'Back to the front page' })
    .children(
      h.span
        .class('news-text')
        .attrs({
          role: 'status',
          // NOTE: the text's length in characters, so the CSS can ease the
          // pill's width from exactly this text down to BACK.
          style: `--chars: ${text.length}`,
        })
        .children(text),
      h.span.class('back-text').attr('aria-hidden', 'true').children('← BACK'),
    )
}
