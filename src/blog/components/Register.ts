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
import { POSTS, isDraft, sheetOf } from '../posts.ts'
import type { Part, Snippet } from '../search/snippet.ts'

export interface Row {
  readonly post: Post
  readonly snippet: Option.Option<Snippet>
}

const Marked = <M>(h: Html.H<M>, parts: ReadonlyArray<Part>) =>
  Arr.map(parts, part => (part.marked ? sx(h.mark, styles.mark).children(part.text) : part.text))

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
              sx(h.time, styles.date).attr('datetime', post.date).children(formatDate(post.date)),
              sx(h.strong, styles.title).children(
                post.title,
                isDraft(post) && sx(h.em, styles.draft).children(' · DRAFT'),
              ),
              sx(h.span, styles.summary).children(
                ...Option.match(summary, { onNone: () => [post.summary], onSome: s => Marked(h, s.parts) }),
              ),
              Option.match(body, {
                onNone: () => null,
                onSome: s => sx(h.span, styles.snippet).children(...Marked(h, s.parts)),
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

// The search box over the register. The blog index passes its live input;
// the placeholder drawn while the index loads passes a quiet one.
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

// "2 RESULTS", or nothing.
export const ResultCount = <M>(h: Html.H<M>, count: Option.Option<number>) =>
  sx(h.p, styles.count)
    .attrs({ role: 'status', 'aria-live': 'polite' })
    .children(Option.match(count, { onNone: () => '', onSome: n => `${n} ${n === 1 ? 'RESULT' : 'RESULTS'}` }))

export const NoMatch = <M>(h: Html.H<M>) => sx(h.p, styles.none).children(BLOG.noMatch)

// Every post, newest first, or a note that there's nothing yet.
export const AllPosts = <M>(h: Html.H<M>) =>
  POSTS.length === 0 ? sx(h.p, sheet.prose).children(BLOG.empty) : PostList(h, POSTS)

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
    display: { default: null, [media.narrow]: 'none' },
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
  // A matched word: gold text, no wash behind it.
  mark: { color: blueprint.hi, backgroundColor: 'transparent', fontWeight: 700 },
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
