import type { Html } from '@effect/ui/html'
import { Array as Arr } from 'effect'

import { BLOG } from '#content/blog'
import { Label } from '#components/Label'
import { formatDate } from '#domain/Post'

import { POSTS, isDraft, sheetOf } from '../../blog/posts.ts'
import { blogRoute, homeRoute, href, postRoute } from '../../routes.ts'

// The bar along the top of every blog sheet.
export const BlogBar = <M>(h: Html.H<M>, right: string) =>
  h.div
    .class('top')
    .children(
      h.nav(
        h.a.attr('href', href(homeRoute)).children('TANNER SCADDEN'),
        h.a.attr('href', href(blogRoute)).children('BLOG'),
      ),
      h.span(right),
    )

// NOTE: /blog, the index. Each post is a row in the drawing register: its
// sheet number, date, title and summary.
export const BlogPage = <M>(h: Html.H<M>) =>
  h.main
    .class('sheet', 'blog')
    .children(
      BlogBar(h, `SET B · ${POSTS.length} ${POSTS.length === 1 ? 'SHEET' : 'SHEETS'}`),
      h.header
        .class('hero')
        .children(
          h.h1(BLOG.title),
          h.p.class('role').children(BLOG.role),
          h.p.class('intro').children(BLOG.intro),
        ),
      h.section.class('blk').children(
        Label(h, 1, BLOG.index),
        POSTS.length === 0
          ? h.p.class('p').children(BLOG.empty)
          : h.ol.class('register').children(
              ...Arr.map(POSTS, post =>
                h.li(
                  h.a.attr('href', href(postRoute(post.slug))).children(
                    h.span.class('no').children(sheetOf(post)),
                    h.span
                      .class('entry')
                      .children(
                        h.time.attr('datetime', post.date).children(formatDate(post.date)),
                        h.strong(post.title, isDraft(post) && h.em(' · DRAFT')),
                        h.span.class('sum').children(post.summary),
                      ),
                    h.span.class('go').attr('aria-hidden', 'true').children('→'),
                  ),
                ),
              ),
            ),
      ),
    )
