import type { Html } from '@effect/ui/html'
import { Option } from 'effect'

import { BLOG } from '#content/blog'
import { type Post, formatDate } from '#domain/Post'

import { neighboursOf, sheetOf } from '../../blog/posts.ts'
import { blogRoute, href, postRoute } from '../../routes.ts'
import { BlogBar } from './BlogPage.ts'

// NOTE: /blog/:slug. The title block sits on the blueprint like the corner
// of a drawing; the body gets a deeper panel with no grid behind the text.
export const PostPage = <M>(h: Html.H<M>, post: Post) => {
  const sheet = sheetOf(post)
  const { newer, older } = neighboursOf(post)
  return h.main
    .class('sheet', 'post')
    .children(
      BlogBar(h, `SHEET ${sheet}`),
      h.article(
        h.header
          .class('title-block')
          .children(
            h.h1(post.title),
            h.p.class('dek').children(post.summary),
            h.dl(
              h.div(h.dt('DRAWN'), h.dd(h.time.attr('datetime', post.date).children(formatDate(post.date)))),
              h.div(h.dt('SHEET'), h.dd(sheet)),
              h.div(h.dt('BY'), h.dd(BLOG.author)),
            ),
          ),
        h.div.class('paper').children(h.div.class('prose').children(...post.body(h))),
      ),
      h.nav
        .class('pager')
        .attr('aria-label', 'More posts')
        .children(
          Pager(h, BLOG.newer, newer, 'newer'),
          h.a.class('all').attr('href', href(blogRoute)).children(BLOG.back),
          Pager(h, BLOG.older, older, 'older'),
        ),
    )
}

const Pager = <M>(h: Html.H<M>, label: string, post: Option.Option<Post>, side: string) =>
  Option.match(post, {
    onNone: () => h.span.class(side),
    onSome: post =>
      h.a
        .class(side)
        .attr('href', href(postRoute(post.slug)))
        .children(h.small(label), h.strong(post.title)),
  })
