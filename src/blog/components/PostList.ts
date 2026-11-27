import { UiSchema } from '@effect/ui'
import { Html } from '@effect/ui/html'
import * as stylex from '@stylexjs/stylex'
import { Array as Arr, Schema, String as Str } from 'effect'

import { sheet } from '#components/Sheet'
import { BLOG } from '#content/blog'
import { type Post, formatDate } from '#domain/Post'

import { href, postRoute } from '../../routes.ts'
import { base } from '../../styles/base.ts'
import { sx } from '../../styles/sx.ts'
import { blueprint, fonts, media, widths } from '../../styles/tokens.stylex.ts'
import { POSTS, isDraft, sheetOf } from '../posts.ts'

// NOTE: the drawing register: a row per post, with its sheet number, date,
// title and summary. The blog index lists every post, with a search over
// them; the home page lists the newest few.

export const PostList = <M>(h: Html.H<M>, posts: ReadonlyArray<Post>) =>
  sx(h.ol, styles.register).children(
    ...Arr.map(posts, post =>
      sx(h.li, styles.row).children(
        sx(h.a, base.link, styles.entry, stylex.defaultMarker())
          .attr('href', href(postRoute(post.slug)))
          .children(
            sx(h.span, styles.no).children(sheetOf(post)),
            sx(h.span, styles.text).children(
              sx(h.time, styles.date).attr('datetime', post.date).children(formatDate(post.date)),
              sx(h.strong, styles.title).children(post.title, isDraft(post) && sx(h.em, styles.draft).children(' · DRAFT')),
              sx(h.span, styles.summary).children(post.summary),
            ),
            sx(h.span, styles.go).attr('aria-hidden', 'true').children('→'),
          ),
      ),
    ),
  )

// Does the post's title or summary have every word of the query in it?
const matches = (query: string) => {
  const words = Arr.filter(Str.split(Str.toLowerCase(Str.trim(query)), /\s+/), word => word !== '')
  return (post: Post): boolean => {
    const text = Str.toLowerCase(`${post.title} ${post.summary}`)
    return Arr.every(words, word => Str.includes(word)(text))
  }
}

const Message = UiSchema.TaggedEnum({ Searched: { query: Schema.String } })

// Every post, with a small search over them.
export const BlogIndex = Html.component({
  name: 'BlogIndex',
  model: Schema.Struct({ query: Schema.String }),
  message: Message,
}).make({
  init: () => ({ query: '' }),
  update: { Searched: ($, { query }) => $.evolve({ query: () => query }) },
  view: (h, model) => {
    const found = Arr.filter(POSTS, matches(model.query))
    return h.div(
      sx(h.label, styles.search).children(
        sx(h.span, styles.searchLabel).children('SEARCH'),
        sx(h.input, base.focus, styles.searchInput)
          .attrs({ type: 'search', placeholder: 'Find a post', 'aria-label': 'Search posts', autocomplete: 'off' })
          .on('input', ({ value }) => Message.Searched({ query: value })),
      ),
      POSTS.length === 0
        ? sx(h.p, sheet.prose).children(BLOG.empty)
        : found.length === 0
          ? sx(h.p, styles.none).children(BLOG.noMatch)
          : PostList(h, found),
    )
  },
})

const styles = stylex.create({
  search: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginBottom: 22,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: blueprint.faint,
  },
  searchLabel: { fontSize: 11, letterSpacing: '.18em', color: blueprint.dim },
  searchInput: {
    flexGrow: 1,
    minWidth: 0,
    fontFamily: fonts.mono,
    fontSize: 14,
    color: blueprint.line,
    backgroundColor: 'transparent',
    borderWidth: 0,
    paddingBlock: 4,
    '::placeholder': { color: blueprint.faint },
  },
  none: { paddingBlock: 20, color: blueprint.dim },
  register: { listStyle: 'none' },
  row: {
    borderTopWidth: 1,
    borderTopStyle: 'dashed',
    borderTopColor: blueprint.faint,
    borderBottomWidth: { default: null, ':last-child': 1 },
    borderBottomStyle: { default: null, ':last-child': 'dashed' },
    borderBottomColor: { default: null, ':last-child': blueprint.faint },
  },
  entry: {
    display: 'grid',
    gridTemplateColumns: { default: '64px 1fr 24px', [media.narrow]: '52px 1fr' },
    gap: { default: 20, [media.narrow]: 14 },
    alignItems: 'start',
    paddingBlock: 20,
    paddingInline: 4,
    color: blueprint.line,
    textDecoration: 'none',
    backgroundColor: { default: null, ':hover': blueprint.wash, ':focus-visible': blueprint.wash },
    transitionProperty: 'background-color',
    transitionDuration: '.15s',
  },
  no: {
    fontSize: 11,
    letterSpacing: '.14em',
    color: blueprint.hi,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: blueprint.dim,
    textAlign: 'center',
    paddingBlock: 3,
    marginTop: 2,
  },
  text: { display: 'grid', gap: 4 },
  date: { fontSize: 10.5, letterSpacing: '.16em', color: blueprint.dim },
  title: {
    fontFamily: fonts.display,
    fontWeight: 800,
    fontSize: { default: 21, [media.narrow]: 18 },
    lineHeight: 1.15,
    fontStretch: widths.semi,
    color: {
      default: null,
      [stylex.when.ancestor(':hover')]: blueprint.hi,
      [stylex.when.ancestor(':focus-visible')]: blueprint.hi,
    },
  },
  draft: {
    fontFamily: fonts.mono,
    fontWeight: 400,
    fontStyle: 'normal',
    fontStretch: widths.normal,
    fontSize: 11,
    lineHeight: 'normal',
    letterSpacing: '.14em',
    color: blueprint.hi,
  },
  summary: { color: blueprint.dim, maxWidth: 620 },
  go: {
    display: { default: null, [media.narrow]: 'none' },
    alignSelf: 'center',
    color: {
      default: blueprint.dim,
      [stylex.when.ancestor(':hover')]: blueprint.hi,
      [stylex.when.ancestor(':focus-visible')]: blueprint.hi,
    },
    transform: {
      default: null,
      [stylex.when.ancestor(':hover')]: 'translateX(3px)',
      [stylex.when.ancestor(':focus-visible')]: 'translateX(3px)',
    },
    transitionProperty: 'color, transform',
    transitionDuration: '.15s',
  },
})
