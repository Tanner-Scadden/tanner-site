import { Array as Arr, Effect, Option, Schema, String as Str } from 'effect'
import { dual, pipe } from 'effect/Function'

import { BLOG } from '#content/blog'
import { type Post, sortPosts } from '#domain/Post'

export const SITE = 'https://tannerscadden.com'
const NAME = 'Tanner Scadden'
const IMAGE = {
  url: `${SITE}/og/home.png`,
  alt: 'Tanner Scadden, software engineer: I like to build things. Mostly software, sometimes games. Beside it, this site drawn as a blueprint of a house.',
}
const AUTHOR = { '@type': 'Person', name: NAME, url: `${SITE}/` } as const

export interface Page {
  readonly file: string
  readonly url: string
  readonly title: string
  readonly description: string
  readonly published?: string
  readonly image: { readonly url: string; readonly alt: string }
  readonly jsonLd: Schema.Json
}

const postUrl = (post: Post): string => `${SITE}/blog/${post.slug}`
const imageOf = (post: Post): Page['image'] =>
  Option.match(Option.fromNullishOr(post.image), {
    onNone: () => IMAGE,
    onSome: image => ({ url: `${SITE}${image.path}`, alt: image.alt }),
  })

const postJsonLd = (post: Post) => ({
  '@type': 'BlogPosting',
  headline: post.title,
  description: post.summary,
  datePublished: post.date,
  url: postUrl(post),
  mainEntityOfPage: postUrl(post),
  image: imageOf(post).url,
  author: AUTHOR,
})

export const pagesOf = (published: ReadonlyArray<Post>): ReadonlyArray<Page> => {
  const posts = sortPosts(published)
  if (posts.length === 0) return []
  return [
    {
      file: 'blog.html',
      url: `${SITE}/blog`,
      title: `${BLOG.title} · ${NAME}`,
      description: BLOG.intro,
      image: IMAGE,
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
      image: imageOf(post),
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

const literally = Str.replaceAll('$', '$$$$')

const encodeJson = Schema.encodeOption(Schema.fromJsonString(Schema.Json))
const jsonLdScript = (value: Schema.Json): string =>
  `<script type="application/ld+json">${
    Str.replaceAll('<', '\\u003c')(Option.getOrElse(encodeJson(value), () => '{}'))
  }</script>`

const tag = (kind: 'meta' | 'link', key: string, valueAttr: string, value: string) => ({
  find: new RegExp(`<${kind} ${key} ${valueAttr}="[^"]*" />`),
  put: `<${kind} ${key} ${valueAttr}="${attr(value)}" />`,
})

export class HeadTagMissing extends Schema.TaggedError<HeadTagMissing, { readonly brand: unique symbol }>()(
  'HeadTagMissing',
  { pattern: Schema.String, file: Schema.String },
) {
  override get message(): string {
    return `index.html should have exactly one ${this.pattern} for ${this.file}`
  }
}

interface Swap {
  readonly find: RegExp
  readonly put: string
}

const swapOnce = (file: string) => (out: string, { find, put }: Swap): Effect.Effect<string, HeadTagMissing> => {
  if (Arr.length(Arr.fromIterable(Str.matchAll(new RegExp(find.source, 'g'))(out))) !== 1) {
    return Effect.fail(HeadTagMissing.make({ pattern: find.source, file }))
  }
  return Effect.succeed(Str.replace(find, literally(put))(out))
}

const OG_LOCALE = /<meta property="og:locale" content="[^"]*" \/>/

export const withHead: {
  (page: Page): (html: string) => string
  (html: string, page: Page): string
} = dual(2, (html: string, page: Page): string => {
  const locale = Option.getOrElse(Option.flatMap(Str.match(OG_LOCALE)(html), Arr.head), () => '')
  const published = Option.fromNullishOr(page.published)
  const article = Option.match(published, {
    onNone: () => '',
    onSome: date =>
      `\n    <meta property="article:published_time" content="${attr(date)}" />` +
      `\n    <meta property="article:author" content="${attr(NAME)}" />`,
  })
  const swaps: ReadonlyArray<Swap> = [
    { find: /<title>[^<]*<\/title>/, put: `<title>${attr(page.title)}</title>` },
    tag('meta', 'name="description"', 'content', page.description),
    tag('link', 'rel="canonical"', 'href', page.url),
    tag('meta', 'property="og:type"', 'content', Option.match(published, { onNone: () => 'website', onSome: () => 'article' })),
    tag('meta', 'property="og:url"', 'content', page.url),
    tag('meta', 'property="og:title"', 'content', page.title),
    tag('meta', 'property="og:description"', 'content', page.description),
    tag('meta', 'name="twitter:title"', 'content', page.title),
    tag('meta', 'name="twitter:description"', 'content', page.description),
    tag('meta', 'property="og:image"', 'content', page.image.url),
    tag('meta', 'property="og:image:alt"', 'content', page.image.alt),
    tag('meta', 'name="twitter:image"', 'content', page.image.url),
    tag('meta', 'name="twitter:image:alt"', 'content', page.image.alt),
    { find: OG_LOCALE, put: `${locale}${article}` },
    { find: /<script type="application\/ld\+json">[\s\S]*?<\/script>/, put: jsonLdScript(page.jsonLd) },
  ]
  return Effect.runSync(Effect.reduce(swaps, () => html, swapOnce(page.file)))
})

export const sitemap = (published: ReadonlyArray<Post>): string => {
  const pages = pagesOf(published)
  const url = (loc: string, lastmod: Option.Option<string>) =>
    `  <url>\n    <loc>${attr(loc)}</loc>\n${
      Option.match(lastmod, { onNone: () => '', onSome: date => `    <lastmod>${date}</lastmod>\n` })
    }  </url>\n`
  const newest = Option.map(Arr.head(sortPosts(published)), post => post.date)
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    url(`${SITE}/`, Option.none()) +
    Arr.join(
      Arr.map(pages, page =>
        url(page.url, Option.orElse(Option.fromNullishOr(page.published), () => newest))),
      '',
    ) +
    '</urlset>\n'
  )
}
