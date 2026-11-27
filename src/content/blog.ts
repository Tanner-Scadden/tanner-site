// NOTE: the blog's copy, and the list of every post. To add a post, see
// content/posts/AGENTS.md: write it in content/posts/, add it to WRITING while
// you work on it, then move it to PUBLISHED. Order doesn't matter; the blog
// sorts by date.

import type { Post } from '#domain/Post'

import { beSomeoneWorthCalling } from './posts/be-someone-worth-calling.ts'

export const PUBLISHED: ReadonlyArray<Post> = [beSomeoneWorthCalling]

// Posts being written. Put them in WRITING: they show under `bun run dev`
// only, and a build swaps the list for an empty one, so a draft's words
// never ship.
const WRITING: ReadonlyArray<Post> = []

export const DRAFTS: ReadonlyArray<Post> = import.meta.env.DEV ? WRITING : []

export const BLOG = {
  title: 'Blog',
  intro: 'A collection of random thoughts I think might be good.',
  noMatch: 'No posts match that yet.',
  // The section on the home page.
  section: 'BLOG',
  newest: 3,
  all: 'ALL POSTS →',
  empty: 'Nothing posted yet. The first one is still on the drafting table.',
  back: '← ALL POSTS',
  // Under each post, linking to its file on GitHub.
  source: 'See how this post is built ↗',
  newer: 'NEWER',
  older: 'OLDER',
} as const
