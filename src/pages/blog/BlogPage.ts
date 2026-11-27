import { Component } from '@effect/ui'
import type { Html } from '@effect/ui/html'
import * as stylex from '@stylexjs/stylex'
import { Option } from 'effect'

import { Section, sheet } from '#components/Sheet'
import { BLOG } from '#content/blog'

import { AllPosts, ResultCount, SearchBar } from '../../blog/components/Register.ts'
import { POSTS } from '../../blog/posts.ts'
import { blogRoute, homeRoute, href } from '../../routes.ts'
import { base } from '../../styles/base.ts'
import { sx } from '../../styles/sx.ts'
import { blueprint } from '../../styles/tokens.stylex.ts'

// The bar along the top of every blog sheet.
export const BlogBar = <M>(h: Html.H<M>, right: string) =>
  sx(h.div, sheet.bar).children(
    sx(h.nav, sheet.nav).children(
      sx(h.a, base.link, sheet.navLink).attr('href', href(homeRoute)).children('TANNER SCADDEN'),
      sx(h.a, base.link, sheet.navLink).attr('href', href(blogRoute)).children('BLOG'),
    ),
    h.span(right),
  )

const BlogIndex = Component.lazy('BlogIndex', () =>
  import('../../blog/components/BlogIndex.ts').then(module => module.BlogIndex),
)

const Waiting = <M>(h: Html.H<M>) =>
  h.div(
    SearchBar(h, input => input.attr('disabled', '')),
    ResultCount(h, Option.none()),
    AllPosts(h),
  )

export const BlogPage = <M>(h: Html.H<M>) =>
  sx(h.main, sheet.sheet).children(
    BlogBar(h, `SET B · ${POSTS.length} ${POSTS.length === 1 ? 'SHEET' : 'SHEETS'}`),
    sx(h.header, sheet.hero).children(
      sx(h.h1, sheet.title).children(BLOG.title),
      sx(h.p, styles.intro).children(BLOG.intro),
    ),
    Section(h, 'sheets').children(BlogIndex(h, { key: 'index', fallback: () => Waiting(h) })),
  )

const styles = stylex.create({
  intro: { marginTop: 18, maxWidth: 560, color: blueprint.dim },
})
