import type { View } from '@effect/ui'
import type { Html } from '@effect/ui/html'

// NOTE: the few blocks a post needs beyond plain tags. Everything else is
// just `h.p`, `h.h2`, `h.ul`, `h.blockquote` and friends inside `.prose`.

// A margin note, drawn like a callout on a drawing: a label and a box.
export const Note = <M>(h: Html.H<M>, label: string, ...children: View.Children<M, never>) =>
  h.aside.class('note').children(h.small(label), h.div(...children))

// A code listing. `label` names the file or language, shown on the tab.
export const Code = <M>(h: Html.H<M>, code: string, label?: string) =>
  h.figure
    .class('code')
    .children(label !== undefined && h.figcaption(label), h.pre(h.code(code)))

// An image with a caption. Put the file in public/blog/ and pass '/blog/name.png'.
export const Figure = <M>(
  h: Html.H<M>,
  { src, alt, caption }: { readonly src: string; readonly alt: string; readonly caption?: string },
) =>
  h.figure
    .class('fig')
    .children(
      h.img.attrs({ src, alt, loading: 'lazy' }),
      caption !== undefined && h.figcaption(caption),
    )
