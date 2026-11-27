import type { View } from '@effect/ui'
import type { Html } from '@effect/ui/html'

import { type CodeLang, LANG_NAMES } from '../highlight.ts'
import { CopyCode, HighlightCode } from '../mounts/CodeMounts.ts'

// NOTE: the few blocks a post needs beyond plain tags. Everything else is
// just `h.p`, `h.h2`, `h.ul`, `h.blockquote` and friends inside `.prose`.

// A margin note, drawn like a callout on a drawing: a label and a box.
export const Note = <M>(h: Html.H<M>, label: string, ...children: View.Children<M, never>) =>
  h.aside.class('note').children(h.small(label), h.div(...children))

// A code listing, highlighted, with a copy button. The tab shows `file` if
// given, else the language.
export const Code = <M>(
  h: Html.H<M>,
  { code, lang, file }: { readonly code: string; readonly lang: CodeLang; readonly file?: string },
) =>
  h.figure
    .class('code')
    .children(
      h.figcaption(
        h.span(file ?? LANG_NAMES[lang]),
        h.button
          .class('copy')
          .attrs({ type: 'button', 'aria-label': 'Copy code' })
          .onMount(CopyCode({ code })),
      ),
      h.pre(h.code.attr('data-lang', lang).onMount(HighlightCode({ code, lang }))),
    )

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
