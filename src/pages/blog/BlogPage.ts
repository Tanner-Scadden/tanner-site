import type { Html } from '@effect/ui/html'
import * as stylex from '@stylexjs/stylex'
import { Array as Arr } from 'effect'

import { Callout, Section, sheet } from '#components/Sheet'
import { BLOG } from '#content/blog'
import { formatDate } from '#domain/Post'

import { POSTS, isDraft, sheetOf } from '../../blog/posts.ts'
import { blogRoute, homeRoute, href, postRoute } from '../../routes.ts'
import { sx } from '../../styles/sx.ts'
import { blueprint, fonts, media, widths } from '../../styles/tokens.stylex.ts'

// The bar along the top of every blog sheet.
export const BlogBar = <M>(h: Html.H<M>, right: string) =>
  sx(h.div, sheet.bar).children(
    sx(h.nav, sheet.nav).children(
      sx(h.a, sheet.navLink).attr('href', href(homeRoute)).children('TANNER SCADDEN'),
      sx(h.a, sheet.navLink).attr('href', href(blogRoute)).children('BLOG'),
    ),
    h.span(right),
  )

// NOTE: /blog, the index. Each post is a row in the drawing register: its
// sheet number, date, title and summary.
export const BlogPage = <M>(h: Html.H<M>) =>
  sx(h.main, sheet.sheet).children(
    BlogBar(h, `SET B · ${POSTS.length} ${POSTS.length === 1 ? 'SHEET' : 'SHEETS'}`),
    sx(h.header, sheet.hero).children(
      sx(h.h1, sheet.title).children(BLOG.title),
      sx(h.p, sheet.role).children(BLOG.role),
      sx(h.p, styles.intro).children(BLOG.intro),
    ),
    Section(h, 'sheets').children(
      Callout(h, 1, BLOG.index),
      POSTS.length === 0
        ? sx(h.p, sheet.prose).children(BLOG.empty)
        : sx(h.ol, styles.register).children(
            ...Arr.map(POSTS, post =>
              sx(h.li, styles.row).children(
                sx(h.a, styles.entry, stylex.defaultMarker())
                  .attr('href', href(postRoute(post.slug)))
                  .children(
                    sx(h.span, styles.no).children(sheetOf(post)),
                    sx(h.span, styles.text).children(
                      sx(h.time, styles.date).attr('datetime', post.date).children(formatDate(post.date)),
                      sx(h.strong, styles.title).children(
                        post.title,
                        isDraft(post) && sx(h.em, styles.draft).children(' · DRAFT'),
                      ),
                      sx(h.span, styles.summary).children(post.summary),
                    ),
                    sx(h.span, styles.go).attr('aria-hidden', 'true').children('→'),
                  ),
              ),
            ),
          ),
    ),
  )

const styles = stylex.create({
  intro: { marginTop: 18, maxWidth: 560, color: blueprint.dim },
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
