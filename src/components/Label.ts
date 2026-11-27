import type { Html } from '@effect/ui/html'

// NOTE: a section heading drawn like a drawing callout: a numbered bubble,
// the title, and a leader line out to the sheet edge.
export const Label = <M>(h: Html.H<M>, n: number, text: string) =>
  h.h2
    .class('label')
    .children(
      h.i.attr('aria-hidden', 'true').children(String(n)),
      text,
      h.span.class('rule').attr('aria-hidden', 'true'),
    )
