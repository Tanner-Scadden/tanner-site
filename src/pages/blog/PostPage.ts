import type { Html } from '@effect/ui/html'
import * as stylex from '@stylexjs/stylex'
import { Option } from 'effect'

import { sheet } from '#components/Sheet'
import { BLOG } from '#content/blog'
import { type Post, formatDate, sourcePath } from '#domain/Post'
import { SITE_REPO_URL } from '#content/home'

import { proseTags } from '../../blog/components/Prose.ts'
import { flow } from '../../blog/components/prose.stylex.ts'
import { minutesOf, neighboursOf, sheetOf } from '../../blog/posts.ts'
import { blogRoute, href, postRoute } from '../../routes.ts'
import { base } from '../../styles/base.ts'
import { sx } from '../../styles/sx.ts'
import { blueprint, fonts, media, widths } from '../../styles/tokens.stylex.ts'
import { BlogBar } from './BlogPage.ts'

export const PostPage = <M>(h: Html.H<M>, post: Post) => {
  const sheetNo = sheetOf(post)
  const { newer, older } = neighboursOf(post)
  return sx(h.main, sheet.sheet).children(
    BlogBar(h, `SHEET ${sheetNo}`),
    h.article(
      sx(h.header, sheet.hero, post.hero !== undefined && styles.withHero).children(
        h.div(
          sx(h.p, styles.when).children(
            h.time.attr('datetime', post.date).children(formatDate(post.date)),
            ` · ${BLOG.read(minutesOf(post))}`,
          ),
          sx(h.h1, styles.title).children(post.title),
          sx(h.p, styles.dek).children(post.summary),
        ),
        post.hero !== undefined && h.div(...post.hero(h)),
      ),
      sx(h.div, styles.prose).children(...post.body(proseTags(h))),
      sx(h.p, styles.source).children(
        sx(h.a, base.link, styles.sourceLink)
          .attrs({ href: `${SITE_REPO_URL}/blob/main/${sourcePath(post)}`, target: '_blank', rel: 'noopener noreferrer' })
          .children(BLOG.source),
      ),
    ),
    sx(h.nav, styles.pager)
      .attr('aria-label', 'More posts')
      .children(
        Pager(h, BLOG.newer, newer, false),
        sx(h.a, base.link, styles.cell, styles.all).attr('href', href(blogRoute)).children(BLOG.back),
        Pager(h, BLOG.older, older, true),
      ),
  )
}

const Pager = <M>(h: Html.H<M>, label: string, post: Option.Option<Post>, older: boolean) =>
  Option.match(post, {
    onNone: () => sx(h.span, styles.cell),
    onSome: post =>
      sx(h.a, base.link, styles.cell, styles.link, older && styles.older)
        .attr('href', href(postRoute(post.slug)))
        .children(
          sx(h.small, styles.pagerLabel).children(label),
          sx(h.strong, styles.pagerTitle).children(post.title),
        ),
  })

const styles = stylex.create({
  // The title on one side and its drawing on the other, stacked on a
  // phone, like the home page's hello and house.
  withHero: {
    display: 'grid',
    gridTemplateColumns: { default: 'minmax(0, 1fr) minmax(0, 1fr)', [media.narrow]: '1fr' },
    gap: { default: 40, [media.narrow]: 28 },
    alignItems: 'center',
  },
  when: {
    display: 'block',
    marginBottom: 14,
    fontSize: 11,
    letterSpacing: '.16em',
    color: blueprint.dim,
  },
  title: {
    fontFamily: fonts.display,
    fontWeight: 900,
    fontSize: { default: 'clamp(30px, 5vw, 56px)', [media.print]: 32 },
    lineHeight: 1.02,
    fontStretch: widths.widest,
    textTransform: 'uppercase',
    textWrap: 'balance',
  },
  dek: { marginTop: 18, maxWidth: 640, fontSize: 16, color: blueprint.dim },
  // The body, in the sheet's own mono type. Prose.ts styles the tags
  // inside, and reads the type size and the gap between blocks from here.
  prose: {
    [flow.size]: '15px',
    [flow.gap]: '1.1em',
    maxWidth: 760,
    paddingTop: { default: 44, [media.narrowScreen]: 32, [media.print]: 16 },
    paddingBottom: { default: 64, [media.narrowScreen]: 48, [media.print]: 16 },
    paddingInline: { default: 40, [media.narrowScreen]: 20, [media.print]: 0 },
    fontFamily: fonts.mono,
    fontSize: flow.size,
    lineHeight: 1.8,
    color: blueprint.line,
  },
  // The way into the post's source, after the body: the encore.
  source: {
    display: { default: null, [media.print]: 'none' },
    paddingBottom: { default: 28, [media.narrowScreen]: 22 },
    paddingInline: { default: 40, [media.narrowScreen]: 20 },
    fontSize: 12,
    letterSpacing: '.08em',
  },
  sourceLink: { color: { default: blueprint.hi, ':hover': blueprint.line, ':focus-visible': blueprint.line } },

  pager: {
    display: { default: 'grid', [media.print]: 'none' },
    gridTemplateColumns: { default: '1fr auto 1fr', [media.narrow]: '1fr 1fr' },
    borderTopWidth: 1,
    borderTopStyle: 'solid',
    borderTopColor: blueprint.line,
  },
  cell: {
    paddingBlock: 14,
    paddingInline: 18,
    color: blueprint.line,
    textDecoration: 'none',
  },
  link: { color: { default: blueprint.line, ':hover': blueprint.hi, ':focus-visible': blueprint.hi } },
  all: {
    color: { default: blueprint.line, ':hover': blueprint.hi, ':focus-visible': blueprint.hi },
    borderStyle: 'solid',
    borderColor: blueprint.line,
    borderWidth: 0,
    borderLeftWidth: { default: 1, [media.narrow]: 0 },
    borderRightWidth: { default: 1, [media.narrow]: 0 },
    borderBottomWidth: { default: 0, [media.narrow]: 1 },
    fontSize: 11,
    letterSpacing: '.14em',
    alignSelf: 'stretch',
    display: 'grid',
    placeItems: 'center',
    gridColumnStart: { default: null, [media.narrow]: 1 },
    gridColumnEnd: { default: null, [media.narrow]: -1 },
    gridRow: { default: null, [media.narrow]: 1 },
  },
  older: { textAlign: 'right' },
  pagerLabel: { display: 'block', fontSize: 10, letterSpacing: '.16em', color: blueprint.dim },
  pagerTitle: { fontFamily: fonts.display, fontWeight: 700, fontSize: 15, fontStretch: widths.slight },
})
