import { View } from '@effect/ui'
import type { Html } from '@effect/ui/html'
import * as stylex from '@stylexjs/stylex'

import { base } from '../../styles/base.ts'
import { sx } from '../../styles/sx.ts'
import { blueprint, fonts, media, post, syntax, widths } from '../../styles/tokens.stylex.ts'
import { type CodeLang, LANG_NAMES } from '../highlight.ts'
import { CopyCode, HighlightCode } from '../mounts/CodeMounts.ts'
import { flow } from './prose.stylex.ts'

// NOTE: a post's body is written with plain tags, `h.p`, `h.h2`, `h.ul`,
// `h.blockquote` and friends, and gets them from `proseTags(h)`: the same
// `h`, with those tags already carrying the post's styles. So every element
// is styled by its own classes, and an author never writes one. The blocks
// below are for what plain tags can't say.
const plainOf = new WeakMap<object, unknown>()

export const proseTags = <M>(h: Html.H<M>): Html.H<M> => {
  // Everything it doesn't restyle, `el`, `id` and the other tags, comes
  // from `h`.
  const tags: Html.H<M> = Object.create(h)
  Object.defineProperties(tags, {
    p: { value: View.shorthand(sx(h.p, prose.block)) },
    h2: { value: View.shorthand(sx(h.h2, prose.h2)) },
    h3: { value: View.shorthand(sx(h.h3, prose.h3)) },
    ul: { value: View.shorthand(sx(h.ul, prose.block, prose.list)) },
    ol: { value: View.shorthand(sx(h.ol, prose.block, prose.list)) },
    li: { value: View.shorthand(sx(h.li, prose.item)) },
    blockquote: { value: View.shorthand(sx(h.blockquote, prose.block, prose.quote)) },
    a: { value: View.shorthand(sx(h.a, base.link, prose.link)) },
    strong: { value: View.shorthand(sx(h.strong, prose.strong)) },
    code: { value: View.shorthand(sx(h.code, prose.code)) },
    hr: { value: sx(h.hr, prose.rule) },
  })
  plainOf.set(tags, h)
  return tags
}

// The `h` that `proseTags` restyled, for a block that draws its own tags.
const plain = <M>(h: Html.H<M>): Html.H<M> => (plainOf.get(h) as Html.H<M> | undefined) ?? h

// A margin note, drawn like a callout on a drawing: a label and a box.
export const Note = <M>(h: Html.H<M>, label: string, ...children: View.Children<M, never>) =>
  sx(h.aside, prose.block, styles.note).children(
    sx(h.small, styles.noteLabel).children(label),
    sx(h.div, styles.noteBody).children(...children),
  )

// A code listing, highlighted, with a copy button. The tab shows `file` if
// given, else the language.
export const Code = <M>(
  h: Html.H<M>,
  { code, lang, file }: { readonly code: string; readonly lang: CodeLang; readonly file?: string },
) =>
  Listing(plain(h), { code, lang, file })

const Listing = <M>(
  h: Html.H<M>,
  { code, lang, file }: { readonly code: string; readonly lang: CodeLang; readonly file?: string | undefined },
) =>
  sx(h.figure, prose.block, styles.code).children(
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
  sx(h.figure, prose.block).children(
    sx(h.img, styles.image).attrs({ src, alt, loading: 'lazy' }),
    caption !== undefined && sx(h.figcaption, styles.caption).children(caption),
  )

// NOTE: a post is set straight on the sheet, in its mono type, so the
// prose takes the sheet's line color and gold. Blocks sit `flow.gap` apart.
// A heading's negative bottom margin collapses into the next block's gap,
// so what follows a heading sits closer: 1.1em less 0.3em of the body size
// is 0.8em.
const prose = stylex.create({
  block: { marginTop: { default: flow.gap, ':first-child': 0 } },
  h2: {
    fontFamily: fonts.display,
    fontWeight: 800,
    fontSize: 22,
    lineHeight: 1.2,
    fontStretch: widths.semi,
    textTransform: 'uppercase',
    color: blueprint.line,
    marginTop: '2.2em',
    marginBottom: `calc(-0.3 * ${flow.size})`,
  },
  h3: {
    fontFamily: fonts.display,
    fontWeight: 800,
    fontSize: 17,
    lineHeight: 1.3,
    fontStretch: widths.slight,
    textTransform: 'uppercase',
    color: blueprint.line,
    marginTop: '1.8em',
    marginBottom: `calc(-0.3 * ${flow.size})`,
  },
  list: { paddingLeft: '1.4em' },
  item: {
    marginTop: { default: '.4em', ':first-child': 0 },
    '::marker': { color: blueprint.hi },
  },
  quote: {
    marginTop: '1.8em',
    marginBottom: '1.8em',
    borderLeftWidth: 2,
    borderLeftStyle: 'solid',
    borderLeftColor: blueprint.hi,
    paddingLeft: 18,
    fontSize: 18,
    lineHeight: 1.6,
  },
  link: {
    textDecorationThickness: { default: '1px', ':hover': '2px' },
    textUnderlineOffset: 3,
  },
  strong: { fontWeight: 700, color: blueprint.hi },
  code: {
    fontFamily: fonts.mono,
    fontWeight: 400,
    fontSize: '.84em',
    lineHeight: 'normal',
    backgroundColor: post.tint,
    paddingBlock: 1,
    paddingInline: 5,
  },
  // A break: a rule with a tick at each end.
  rule: {
    borderStyle: 'none',
    height: 9,
    marginBlock: '2.4em',
    backgroundImage: `linear-gradient(${blueprint.faint}, ${blueprint.faint}), linear-gradient(${blueprint.faint}, ${blueprint.faint}), linear-gradient(${blueprint.faint}, ${blueprint.faint})`,
    backgroundPosition: 'center, left, right',
    backgroundSize: '100% 1px, 1px 100%, 1px 100%',
    backgroundRepeat: 'no-repeat',
  },
})

const styles = stylex.create({
  note: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: blueprint.hi,
    paddingBlock: 16,
    paddingInline: 20,
  },
  // A note's paragraphs sit closer.
  noteBody: { [flow.gap]: '.8em' },
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
  // A <code> takes the browser's monospace unless it's told otherwise.
  listing: { fontFamily: fonts.mono, fontWeight: 400, fontSize: 'inherit', lineHeight: 'normal' },

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
