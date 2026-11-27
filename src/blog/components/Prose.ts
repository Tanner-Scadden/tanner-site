import type { View } from '@effect/ui'
import type { Html } from '@effect/ui/html'
import * as stylex from '@stylexjs/stylex'

import { base } from '../../styles/base.ts'
import { sx } from '../../styles/sx.ts'
import { blueprint, fonts, media, post, syntax } from '../../styles/tokens.stylex.ts'
import { type CodeLang, LANG_NAMES } from '../highlight.ts'
import { CopyCode, HighlightCode } from '../mounts/CodeMounts.ts'

// NOTE: the few blocks a post needs beyond plain tags. Everything else is
// just `h.p`, `h.h2`, `h.ul`, `h.blockquote` and friends, which prose.css
// styles.

// A margin note, drawn like a callout on a drawing: a label and a box.
export const Note = <M>(h: Html.H<M>, label: string, ...children: View.Children<M, never>) =>
  sx(h.aside, styles.note).children(sx(h.small, styles.noteLabel).children(label), h.div(...children))

// A code listing, highlighted, with a copy button. The tab shows `file` if
// given, else the language.
export const Code = <M>(
  h: Html.H<M>,
  { code, lang, file }: { readonly code: string; readonly lang: CodeLang; readonly file?: string },
) =>
  sx(h.figure, styles.code).children(
    sx(h.figcaption, styles.tab).children(
      h.span(file ?? LANG_NAMES[lang]),
      sx(h.button, base.button, styles.copy, stylex.defaultMarker())
        .attrs({ type: 'button', 'aria-label': 'Copy code' })
        .onMount(CopyCode({ code }))
        .children(
          sx(h.span, styles.ready).children('COPY'),
          sx(h.span, styles.copied).children('COPIED'),
          sx(h.span, styles.failed).children('FAILED'),
        ),
    ),
    sx(h.pre, styles.pre).children(
      sx(h.code, styles.listing)
        .attr('data-lang', lang)
        .onMount(HighlightCode({ code, lang })),
    ),
  )

// An image with a caption. Put the file in public/blog/ and pass '/blog/name.png'.
export const Figure = <M>(
  h: Html.H<M>,
  { src, alt, caption }: { readonly src: string; readonly alt: string; readonly caption?: string },
) =>
  h.figure.children(
    sx(h.img, styles.image).attrs({ src, alt, loading: 'lazy' }),
    caption !== undefined && sx(h.figcaption, styles.caption).children(caption),
  )

const styles = stylex.create({
  note: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: blueprint.hi,
    paddingBlock: 16,
    paddingInline: 20,
  },
  noteLabel: {
    display: 'block',
    fontFamily: fonts.mono,
    fontWeight: 700,
    fontSize: 11,
    lineHeight: 'normal',
    letterSpacing: '.16em',
    color: blueprint.hi,
    marginBottom: 4,
  },

  // The listing bleeds to the panel's edges. Shiki colors its tokens with
  // these properties.
  code: {
    '--code-foreground': post.ink,
    '--code-token-comment': syntax.comment,
    '--code-token-keyword': syntax.keyword,
    '--code-token-string': syntax.string,
    '--code-token-string-expression': syntax.string,
    '--code-token-constant': syntax.constant,
    '--code-token-function': syntax.function,
    '--code-token-parameter': post.ink,
    '--code-token-punctuation': syntax.punctuation,
    '--code-token-link': syntax.function,
    backgroundColor: post.codePaper,
    color: post.ink,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: post.rule,
    borderLeftWidth: { default: 1, [media.narrow]: 0 },
    borderRightWidth: { default: 1, [media.narrow]: 0 },
    marginLeft: { default: -24, [media.narrow]: -20 },
    marginRight: { default: -24, [media.narrow]: -20 },
  },
  tab: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    fontFamily: fonts.mono,
    fontSize: 11,
    lineHeight: 'normal',
    letterSpacing: '.1em',
    color: post.inkDim,
    paddingTop: 6,
    paddingRight: 8,
    paddingBottom: 6,
    paddingLeft: 16,
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: post.rule,
  },
  // The button says COPY, then COPIED or FAILED for a moment: CodeMounts
  // sets `data-state`.
  copy: {
    cursor: 'pointer',
    fontFamily: fonts.mono,
    fontWeight: 700,
    fontSize: 10,
    lineHeight: 'normal',
    letterSpacing: '.14em',
    color: {
      default: post.inkDim,
      ':hover': blueprint.hi,
      ':is([data-state="copied"])': post.copied,
      ':is([data-state="failed"])': post.failed,
    },
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: {
      default: post.rule,
      ':hover': blueprint.hi,
      ':is([data-state="copied"])': post.copied,
      ':is([data-state="failed"])': post.failed,
    },
    paddingBlock: 3,
    paddingInline: 9,
    transitionProperty: 'color, border-color',
    transitionDuration: '.15s',
    outlineWidth: { default: null, ':focus-visible': 2 },
    outlineStyle: { default: null, ':focus-visible': 'solid' },
    outlineColor: { default: null, ':focus-visible': blueprint.hi },
    outlineOffset: { default: null, ':focus-visible': 2 },
    display: { default: null, [media.print]: 'none' },
  },
  ready: {
    display: { default: null, [stylex.when.ancestor('[data-state]')]: 'none' },
  },
  copied: {
    display: { default: 'none', [stylex.when.ancestor('[data-state="copied"]')]: 'inline' },
  },
  failed: {
    display: { default: 'none', [stylex.when.ancestor('[data-state="failed"]')]: 'inline' },
  },
  // A soft grid behind the code, one row per line, like graph paper.
  pre: {
    overflowX: 'auto',
    paddingBlock: 12,
    paddingInline: 16,
    fontFamily: fonts.mono,
    fontSize: 14,
    lineHeight: '24px',
    color: 'var(--code-foreground)',
    backgroundImage: `linear-gradient(${post.codeGrid} 1px, transparent 1px), linear-gradient(90deg, ${post.codeGrid} 1px, transparent 1px)`,
    backgroundSize: '24px 24px',
    backgroundPosition: '-1px 11px',
    backgroundAttachment: 'local',
  },
  listing: { backgroundColor: 'transparent', padding: 0, fontSize: 'inherit' },

  image: {
    display: 'block',
    maxWidth: '100%',
    height: 'auto',
    marginBlock: 0,
    marginInline: 'auto',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: post.rule,
  },
  caption: {
    marginTop: 8,
    textAlign: 'center',
    fontFamily: fonts.mono,
    fontSize: 11,
    lineHeight: 'normal',
    letterSpacing: '.14em',
    color: post.inkDim,
  },
})
