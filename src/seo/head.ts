import { Array as Arr, Option, Schema, String as Str } from 'effect'
import { dual, pipe } from 'effect/Function'

import { BLOG } from '#content/blog'
import { type Post, sortPosts } from '#domain/Post'

export const SITE = 'https://tannerscadden.com'
const NAME = 'Tanner Scadden'
const IMAGE = `${SITE}/og.png`
const AUTHOR = { '@type': 'Person', name: NAME, url: `${SITE}/` } as const

export interface Page {
  // Where the build writes it, next to index.html. Cloudflare serves
  // /blog/<slug> from blog/<slug>.html.
  readonly file: string
  readonly url: string
  readonly title: string
  readonly description: string
  // The day a post went up, YYYY-MM-DD. None for the blog itself.
  readonly published?: string
  readonly jsonLd: object
}

const postUrl = (post: Post): string => `${SITE}/blog/${post.slug}`

const postJsonLd = (post: Post) => ({
  '@type': 'BlogPosting',
  headline: post.title,
  description: post.summary,
  datePublished: post.date,
  url: postUrl(post),
  mainEntityOfPage: postUrl(post),
  image: IMAGE,
  author: AUTHOR,
})

// /blog, then each post, newest first. No posts, no blog.
export const pagesOf = (published: ReadonlyArray<Post>): ReadonlyArray<Page> => {
  const posts = sortPosts(published)
  if (posts.length === 0) return []
  return [
    {
      file: 'blog.html',
      url: `${SITE}/blog`,
      title: `${BLOG.title} · ${NAME}`,
      description: BLOG.intro,
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': 'Blog',
        name: `${BLOG.title} · ${NAME}`,
        description: BLOG.intro,
        url: `${SITE}/blog`,
        author: AUTHOR,
        blogPost: Arr.map(posts, postJsonLd),
      },
    },
    ...Arr.map(posts, post => ({
      file: `blog/${post.slug}.html`,
      url: postUrl(post),
      title: `${post.title} · ${NAME}`,
      description: post.summary,
      published: post.date,
      jsonLd: { '@context': 'https://schema.org', ...postJsonLd(post) },
    })),
  ]
}

const attr = (value: string): string =>
  pipe(
    value,
    Str.replaceAll('&', '&amp;'),
    Str.replaceAll('"', '&quot;'),
    Str.replaceAll('<', '&lt;'),
    Str.replaceAll('>', '&gt;'),
  )

// A replacement that means just what it says: `$` in it is never read as a
// pattern, so copy like "$56,000" comes through.
const literally = Str.replaceAll('$', '$$$$')

// The page's structured data, kept from closing its <script> early.
const encodeJson = Schema.encodeOption(Schema.fromJsonString(Schema.Unknown))
const jsonLdScript = (value: object): string =>
  `<script type="application/ld+json">${
    Str.replaceAll('<', '\\u003c')(Option.getOrElse(encodeJson(value), () => '{}'))
  }</script>`

// A `<meta>` or `<link>` whose key attribute is `key`, with its value swapped.
const tag = (kind: 'meta' | 'link', key: string, valueAttr: string, value: string) => ({
  find: new RegExp(`<${kind} ${key} ${valueAttr}="[^"]*" />`),
  put: `<${kind} ${key} ${valueAttr}="${attr(value)}" />`,
})

const OG_LOCALE = /<meta property="og:locale" content="[^"]*" \/>/

export const withHead: {
  (page: Page): (html: string) => string
  (html: string, page: Page): string
} = dual(2, (html: string, page: Page): string => {
  const locale = Option.getOrElse(Option.flatMap(Str.match(OG_LOCALE)(html), Arr.head), () => '')
  const article = page.published === undefined
    ? ''
    : `\n    <meta property="article:published_time" content="${attr(page.published)}" />` +
      `\n    <meta property="article:author" content="${attr(NAME)}" />`
  const swaps = [
    { find: /<title>[^<]*<\/title>/, put: `<title>${attr(page.title)}</title>` },
    tag('meta', 'name="description"', 'content', page.description),
    tag('link', 'rel="canonical"', 'href', page.url),
    tag('meta', 'property="og:type"', 'content', page.published === undefined ? 'website' : 'article'),
    tag('meta', 'property="og:url"', 'content', page.url),
    tag('meta', 'property="og:title"', 'content', page.title),
    tag('meta', 'property="og:description"', 'content', page.description),
    tag('meta', 'name="twitter:title"', 'content', page.title),
    tag('meta', 'name="twitter:description"', 'content', page.description),
    { find: OG_LOCALE, put: `${locale}${article}` },
    { find: /<script type="application\/ld\+json">[\s\S]*?<\/script>/, put: jsonLdScript(page.jsonLd) },
  ]
  return Arr.reduce(swaps, html, (out, { find, put }) => {
    if (Arr.length(Arr.fromIterable(Str.matchAll(new RegExp(find.source, 'g'))(out))) !== 1) {
      throw new Error(`index.html should have exactly one ${find.source} for ${page.file}`)
    }
    return Str.replace(find, literally(put))(out)
  })
})

// Every page a crawler should find: the front page, then the blog's.
export const sitemap = (published: ReadonlyArray<Post>): string => {
  const pages = pagesOf(published)
  const url = (loc: string, lastmod?: string) =>
    `  <url>\n    <loc>${attr(loc)}</loc>\n${lastmod === undefined ? '' : `    <lastmod>${lastmod}</lastmod>\n`}  </url>\n`
  const newest = Arr.head(sortPosts(published))
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    url(`${SITE}/`) +
    Arr.join(
      Arr.map(pages, page =>
        url(page.url, page.published ?? (newest._tag === 'Some' ? newest.value.date : undefined))),
      '',
    ) +
    '</urlset>\n'
  )
}
