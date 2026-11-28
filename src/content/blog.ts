import { Boolean as Bool } from 'effect'

import type { Post } from '#domain/Post'

import { beSomeoneWorthCalling } from './posts/be-someone-worth-calling.ts'

export const PUBLISHED: ReadonlyArray<Post> = [beSomeoneWorthCalling]

const WRITING: ReadonlyArray<Post> = []

export const DRAFTS: ReadonlyArray<Post> = Bool.match(import.meta.env.DEV, { onTrue: () => WRITING, onFalse: () => [] })

export const BLOG = {
  title: 'Blog',
  intro: 'A collection of random thoughts I think might be good.',
  noMatch: 'No posts match that yet.',
  section: 'BLOG',
  newest: 3,
  all: 'ALL POSTS →',
  empty: 'Nothing posted yet. The first one is still on the drafting table.',
  back: '← ALL POSTS',
  source: 'See how this post is built ↗',
  read: (minutes: number) => `${minutes} MIN READ`,
  newer: 'NEWER',
  older: 'OLDER',
} as const
