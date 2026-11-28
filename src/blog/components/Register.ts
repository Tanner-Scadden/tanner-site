import type { Html } from '@effect/ui/html'
import * as stylex from '@stylexjs/stylex'
import { Array as Arr, Option } from 'effect'

import { sheet } from '#components/Sheet'
import { BLOG } from '#content/blog'
import { type Post, formatDate } from '#domain/Post'

import { href, postRoute } from '../../routes.ts'
import { base } from '../../styles/base.ts'
import { sx } from '../../styles/sx.ts'
import { blueprint, fonts, media, widths } from '../../styles/tokens.stylex.ts'
import { POSTS, isDraft, minutesOf, sheetOf } from '../posts.ts'
import type { Part, Snippet } from '../search/snippet.ts'

export interface Row {
  readonly post: Post
  readonly snippet: Option.Option<Snippet>
}

const MarkedPart = <M>(h: Html.H<M>, part: Part) => {
  if (part.marked) return sx(h.mark, styles.mark).children(part.text)
  return part.text
}

const Marked = <M>(h: Html.H<M>, parts: ReadonlyArray<Part>) => Arr.map(parts, part => MarkedPart(h, part))

export const Register = <M>(h: Html.H<M>, rows: ReadonlyArray<Row>) =>
  sx(h.ol, styles.register).children(
    ...Arr.map(rows, ({ post, snippet }) => {
      const summary = Option.filter(snippet, s => s.field === 'summary')
      const body = Option.filter(snippet, s => s.field === 'body')
      return sx(h.li, styles.row).children(
        sx(h.a, base.link, styles.entry, stylex.defaultMarker())
          .attr('href', href(postRoute(post.slug)))
          .children(
            sx(h.span, styles.no).children(sheetOf(post)),
            sx(h.span, styles.text).children(
              sx(h.span, styles.date).children(
                h.time.attr('datetime', post.date).children(formatDate(post.date)),
                ` · ${BLOG.read(minutesOf(post))}`,
              ),
              sx(h.strong, styles.title).children(
                post.title,
                isDraft(post) && sx(h.em, styles.draft).children(' · DRAFT'),
              ),
              sx(h.span, styles.summary).children(
                ...Option.match(summary, { onNone: () => [post.summary], onSome: s => Marked(h, s.parts) }),
              ),
              ...Option.match(body, {
                onNone: () => [],
                onSome: s => [sx(h.span, styles.snippet).children(...Marked(h, s.parts))],
              }),
            ),
            sx(h.span, styles.go).attr('aria-hidden', 'true').children('→'),
          ),
      )
    }),
  )

export const PostList = <M>(h: Html.H<M>, posts: ReadonlyArray<Post>) =>
  Register(
    h,
    Arr.map(posts, post => ({ post, snippet: Option.none() })),
  )

export const SearchBar = <M>(h: Html.H<M>, input: (field: Html.H<M>['input']) => Html.H<M>['input']) =>
  sx(h.label, styles.search).children(
    sx(h.span, styles.searchLabel).children('SEARCH'),
    input(
      sx(h.input, base.focus, styles.searchInput).attrs({
        type: 'search',
        placeholder: 'Find a post',
        'aria-label': 'Search posts',
        autocomplete: 'off',
      }),
    ),
    sx(h.kbd, styles.key).attr('aria-hidden', 'true').children('/'),
  )

const resultsWord = (count: number): string => {
  if (count === 1) return 'RESULT'
  return 'RESULTS'
}

export const ResultCount = <M>(h: Html.H<M>, count: Option.Option<number>) =>
  sx(h.p, styles.count)
    .attrs({ role: 'status', 'aria-live': 'polite' })
    .children(Option.match(count, { onNone: () => '', onSome: n => `${n} ${resultsWord(n)}` }))

export const NoMatch = <M>(h: Html.H<M>) => sx(h.p, styles.none).children(BLOG.noMatch)

export const AllPosts = <M>(h: Html.H<M>) => {
  if (POSTS.length === 0) return sx(h.p, sheet.prose).children(BLOG.empty)
  return PostList(h, POSTS)
}

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
  key: {
    display: { [media.narrow]: 'none' },
    fontFamily: fonts.mono,
    fontSize: 11,
    lineHeight: 'normal',
    color: blueprint.dim,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: blueprint.faint,
    paddingBlock: 1,
    paddingInline: 6,
  },
  count: {
    minHeight: 16,
    marginTop: -12,
    marginBottom: 6,
    fontSize: 10.5,
    letterSpacing: '.16em',
    color: blueprint.dim,
  },
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
    borderBottomWidth: { ':last-child': 1 },
    borderBottomStyle: { ':last-child': 'dashed' },
    borderBottomColor: { ':last-child': blueprint.faint },
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
  snippet: {
    marginTop: 4,
    paddingLeft: 10,
    borderLeftWidth: 1,
    borderLeftStyle: 'solid',
    borderLeftColor: blueprint.faint,
    fontSize: 13,
    color: blueprint.dim,
    maxWidth: 620,
  },
  mark: { color: blueprint.hi, backgroundColor: 'transparent', fontWeight: 700 },
  go: {
    display: { [media.narrow]: 'none' },
    alignSelf: 'center',
    color: {
      default: blueprint.dim,
      [stylex.when.ancestor(':hover')]: blueprint.hi,
      [stylex.when.ancestor(':focus-visible')]: blueprint.hi,
    },
    transform: {
      [stylex.when.ancestor(':hover')]: 'translateX(3px)',
      [stylex.when.ancestor(':focus-visible')]: 'translateX(3px)',
    },
    transitionProperty: 'color, transform',
    transitionDuration: '.15s',
  },
})
