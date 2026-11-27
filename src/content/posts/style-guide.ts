import type { Post } from '#domain/Post'

import { Code, Figure, Note } from '../../blog/components/Prose.ts'

// NOTE: a draft (see DRAFTS in content/blog.ts), so it only shows under
// `bun run dev`. It shows every block a post can use; copy it to start one.
export const styleGuide: Post = {
  slug: 'style-guide',
  title: 'How a post is put together',
  date: '2026-11-27',
  summary: 'Every block a post can use, on one page. Copy this file to start a new one.',
  body: h => [
    h.p(
      'A post is a plain Effect UI view. Paragraphs are ',
      h.code('h.p'),
      ', headings are ',
      h.code('h.h2'),
      ' and ',
      h.code('h.h3'),
      ', and links are ',
      h.a.attr('href', '/').children('ordinary links'),
      '. The page around it, the title block and the sheet number come from the post’s fields.',
    ),
    h.p(
      'Body text is set large with a short line length, on a panel with no grid behind it, so a long post stays easy to read. ',
      h.strong('Bold'),
      ' and ',
      h.em('italic'),
      ' work as you’d expect.',
    ),
    h.h2('A section heading'),
    h.p('Sections get a heading with a rule under it, like a detail on a drawing.'),
    h.ul(
      h.li('Lists use h.ul or h.ol.'),
      h.li('Each item is an h.li.'),
      h.li('Keep items short.'),
    ),
    h.h3('A smaller heading'),
    h.blockquote(h.p('A quote sits in its own column, with a gold rule down the side.')),
    Note(h, 'NOTE', h.p('A note is for an aside: a caveat, a tip, or something you learned the hard way.')),
    Code(
      h,
      `const post: Post = {
  slug: 'my-post',
  title: 'My post',
  date: '2026-11-27',
  summary: 'What it is about.',
  body: h => [h.p('Hello.')],
}`,
      'src/content/posts/my-post.ts',
    ),
    h.p(
      'Images go in public/blog/ and use ',
      h.code('Figure'),
      ', with alt text and an optional caption.',
    ),
    Figure(h, {
      src: '/apple-touch-icon.png',
      alt: 'The site icon',
      caption: 'FIG. 1 · A figure with a caption',
    }),
    h.hr,
    h.p('That’s all of it. Add the post to DRAFTS in src/content/blog.ts while you write it, then move it to PUBLISHED.'),
  ],
}
