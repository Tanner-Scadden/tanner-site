// NOTE: the team figure as a blog animation, drawn by the kit in
// src/blog/animation.

import { makeAnimation } from '../blog/animation/Animation.ts'
import { Array as Arr } from 'effect'

import { type Interaction, type Scene, rememberLast } from '../blog/animation/scene.ts'
import { MAX_FLARES, RIGHT_FOR, RIGHT_START, buildTimeline, frameAt, withFlares } from './bucket.ts'
import { MAX_DOTS, MAX_LINES, shapesOf } from './shapes.ts'

// Seconds until a flare has tipped the bucket and it's stood back up.
const FLARE_SETTLE = RIGHT_START + RIGHT_FOR

export const teamScene: Scene = {
  variants: [
    {
      id: 'team',
      label: 'TEAM',
      caption:
        'Trust is built in drops and lost in buckets.',
      tone: 'hi',
    },
  ],
  run: (_variant, seed) => {
    const timeline = buildTimeline(seed)
    const flared = rememberLast((interactions: ReadonlyArray<Interaction>) =>
      interactions.length === 0 ? timeline : withFlares(timeline, Arr.map(interactions, ({ time }) => time)),
    )
    return {
      end: timeline.end,
      // The end holds still while the run waits to replay, once the last
      // flare a reader added has played out.
      shapesAt: (time, width, height, pointer, interactions) => {
        const last = Arr.reduce(interactions, timeline.end, (latest, { time: at }) =>
          Math.max(latest, at + FLARE_SETTLE),
        )
        return shapesOf(frameAt(flared(interactions), Math.min(time, last)), width, height, pointer)
      },
    }
  },
  maxLines: MAX_LINES,
  maxDots: MAX_DOTS,
  // A bad interaction: a flare of frustration tips some trust out.
  interact: { hint: 'Have a flare of frustration', settle: FLARE_SETTLE, max: MAX_FLARES - 1 },
}

export const TeamFigure = makeAnimation('TeamFigure', teamScene)
