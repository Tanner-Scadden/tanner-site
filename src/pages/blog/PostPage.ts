import type { View } from '@effect/ui'
import type { Html } from '@effect/ui/html'
import * as stylex from '@stylexjs/stylex'
import { Option } from 'effect'

import { sheet } from '#components/Sheet'
import { BLOG } from '#content/blog'
import { type Post, formatDate } from '#domain/Post'

import { proseTags } from '../../blog/components/Prose.ts'
import { flow } from '../../blog/components/prose.stylex.ts'
import { neighboursOf, sheetOf } from '../../blog/posts.ts'
import { blogRoute, href, postRoute } from '../../routes.ts'
import { base } from '../../styles/base.ts'
import { sx } from '../../styles/sx.ts'
import { blueprint, fonts, media, post as ink, widths } from '../../styles/tokens.stylex.ts'
import { BlogBar } from './BlogPage.ts'

// NOTE: /blog/:slug. The title block sits on the blueprint like the corner
// of a drawing; the body gets a deeper panel with no grid behind the text.
export const PostPage = <M>(h: Html.H<M>, post: Post) => {
  const sheetNo = sheetOf(post)
  const { newer, older } = neighboursOf(post)
  return sx(h.main, sheet.sheet).children(
    BlogBar(h, `SHEET ${sheetNo}`),
    h.article(
      sx(h.header, styles.titleBlock).children(
        sx(h.h1, styles.title).children(post.title),
        sx(h.p, styles.dek).children(post.summary),
        sx(h.dl, styles.fields).children(
          Field(h, 'DRAWN', h.time.attr('datetime', post.date).children(formatDate(post.date))),
          Field(h, 'SHEET', sheetNo),
          Field(h, 'BY', BLOG.author),
        ),
      ),
      sx(h.div, styles.paper).children(
        sx(h.div, styles.prose).children(...post.body(proseTags(h))),
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

const Field = <M>(h: Html.H<M>, name: string, value: View.Children<M, never>[number]) =>
  sx(h.div, styles.field).children(
    sx(h.dt, styles.fieldName).children(name),
    sx(h.dd, styles.fieldValue).children(value),
  )

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
  titleBlock: {
    paddingTop: { default: 56, [media.narrowScreen]: 36, [media.print]: 0 },
    paddingInline: { default: 40, [media.narrowScreen]: 20, [media.print]: 0 },
  },
  title: {
    fontFamily: fonts.display,
    fontWeight: 800,
    fontSize: 'clamp(32px, 5vw, 56px)',
    lineHeight: 1.05,
    fontStretch: widths.semi,
    maxWidth: 860,
    textWrap: 'balance',
  },
  dek: { marginTop: 16, fontSize: 16, color: blueprint.dim, maxWidth: 640 },
  fields: {
    display: 'grid',
    gridTemplateColumns: { default: 'repeat(3, auto) 1fr', [media.narrow]: 'repeat(3, 1fr)' },
    marginTop: 32,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: blueprint.line,
    borderBottomStyle: 'none',
  },
  field: {
    paddingBlock: 8,
    paddingInline: { default: 18, [media.narrow]: 10 },
    borderRightWidth: 1,
    borderRightStyle: { default: 'solid', ':last-child': 'none' },
    borderRightColor: blueprint.line,
  },
  fieldName: { fontSize: 9.5, letterSpacing: '.18em', color: blueprint.dim },
  fieldValue: { fontSize: 12, letterSpacing: '.1em' },

  // The body sits in a deeper panel of the blueprint, so the grid steps
  // back behind long text: bright ink, a reading size, a short line.
  paper: {
    marginTop: 0,
    marginInline: { default: 40, [media.narrowScreen]: 0, [media.print]: 0 },
    marginBottom: { default: 44, [media.narrowScreen]: 32, [media.print]: 0 },
    backgroundColor: ink.paper,
    color: ink.ink,
    borderWidth: 1,
    borderStyle: { default: 'solid', [media.print]: 'none' },
    borderColor: blueprint.line,
    borderLeftStyle: { default: 'solid', [media.narrowScreen]: 'none', [media.print]: 'none' },
    borderRightStyle: { default: 'solid', [media.narrowScreen]: 'none', [media.print]: 'none' },
    paddingTop: { default: 64, [media.narrowScreen]: 36, [media.print]: 16 },
    paddingBottom: { default: 72, [media.narrowScreen]: 44, [media.print]: 16 },
    paddingInline: { default: 24, [media.narrowScreen]: 20, [media.print]: 0 },
  },
  // The body type: a reading size, a short line.
  prose: {
    [flow.size]: { default: '18px', [media.narrow]: '17px' },
    maxWidth: 680,
    marginInline: 'auto',
    fontFamily: fonts.reading,
    fontWeight: 400,
    fontSize: flow.size,
    lineHeight: 1.75,
    fontStretch: widths.normal,
  },

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
