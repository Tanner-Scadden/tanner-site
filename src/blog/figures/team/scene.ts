import { Array as Arr } from 'effect'

import { makeAnimation } from '../../animation/Animation.ts'
import { type Interaction, type Scene, rememberLast } from '../../animation/scene.ts'
import { KICK_SETTLE, MAX_KICKS, buildTimeline, frameAt, withKicks } from './bucket.ts'
import { MAX_DOTS, MAX_LINES, marksOf } from './marks.ts'

export const teamScene: Scene = {
  variants: [{ id: 'team', label: 'TEAM', caption: 'Trust is built in drops and lost in buckets. Press the hand to kick the bucket, and see how much spills.', tone: 'hi' }],
  run: (_variant, seed) => {
    const timeline = buildTimeline(seed)
    const kicked = rememberLast((interactions: ReadonlyArray<Interaction>) => {
      if (interactions.length === 0) return timeline
      return withKicks(timeline, Arr.map(interactions, ({ time }) => time))
    })
    return {
      end: timeline.end,
      marksAt: (time, width, height, pointer, interactions) =>
        marksOf(frameAt(kicked(interactions), time), width, height, pointer),
    }
  },
  maxLines: MAX_LINES,
  maxDots: MAX_DOTS,
  interact: { hint: 'Kick the bucket', settle: KICK_SETTLE, max: MAX_KICKS - 1 },
}

export const TeamFigure = makeAnimation('TeamFigure', teamScene)
