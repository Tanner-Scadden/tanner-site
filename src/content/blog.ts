// NOTE: the blog's copy, and the list of every post. To add a post, write it
// in content/posts/ (copy style-guide.ts) and add it to DRAFTS while you
// work on it, then move it to PUBLISHED. Order doesn't matter; the blog sorts
// by date.

import type { Post } from '#domain/Post'

import { beSomeoneWorthCalling } from './posts/be-someone-worth-calling.ts'
import { styleGuide } from './posts/style-guide.ts'

export const PUBLISHED: ReadonlyArray<Post> = [beSomeoneWorthCalling]

// Drafts show under `bun run dev` only. A build swaps the list for an empty
// one, so a draft's words never ship.
export const DRAFTS: ReadonlyArray<Post> = import.meta.env.DEV ? [styleGuide] : []

export const BLOG = {
  title: 'Blog',
  role: 'Notes from the build',
  intro: 'What I’m building, what broke, and what I learned fixing it.',
  index: 'SHEET INDEX',
  empty: 'Nothing posted yet. The first one is still on the drafting table.',
  back: '← ALL POSTS',
  newer: 'NEWER',
  older: 'OLDER',
} as const
