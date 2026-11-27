// NOTE: the team figure as a blog animation, drawn by the kit in
// src/blog/animation.

import { Array as Arr } from 'effect'

import { makeAnimation } from '../../animation/Animation.ts'
import { type Interaction, type Scene, rememberLast } from '../../animation/scene.ts'
import { KICK_SETTLE, MAX_KICKS, buildTimeline, frameAt, withKicks } from './bucket.ts'
import { MAX_DOTS, MAX_LINES, shapesOf } from './shapes.ts'

export const teamScene: Scene = {
  variants: [{ id: 'team', label: 'TEAM', caption: 'Trust is built in drops and lost in buckets.', tone: 'hi' }],
  run: (_variant, seed) => {
    const timeline = buildTimeline(seed)
    // Each press is a kick, spilling half of whatever water is there.
    const kicked = rememberLast((interactions: ReadonlyArray<Interaction>) =>
      interactions.length === 0 ? timeline : withKicks(timeline, Arr.map(interactions, ({ time }) => time)),
    )
    // Past the end, and past the last kick's KICK_SETTLE, nothing moves, so
    // the hold is still on its own.
    return {
      end: timeline.end,
      shapesAt: (time, width, height, pointer, interactions) =>
        shapesOf(frameAt(kicked(interactions), time), width, height, pointer),
    }
  },
  maxLines: MAX_LINES,
  maxDots: MAX_DOTS,
  // A bad interaction: someone kicks the bucket, and some trust slops out.
  interact: { hint: 'Kick the bucket', settle: KICK_SETTLE, max: MAX_KICKS - 1 },
}

export const TeamFigure = makeAnimation('TeamFigure', teamScene)
