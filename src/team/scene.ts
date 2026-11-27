// NOTE: the team figure as a blog animation, drawn by the kit in
// src/blog/animation.

import { makeAnimation } from '../blog/animation/Animation.ts'
import type { Scene } from '../blog/animation/scene.ts'
import { buildTimeline, frameAt } from './bucket.ts'
import { MAX_DOTS, MAX_LINES, shapesOf } from './shapes.ts'

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
    return {
      end: timeline.end,
      // The end holds still while the run waits to replay.
      shapesAt: (time, width, height, pointer) =>
        shapesOf(frameAt(timeline, Math.min(time, timeline.end)), width, height, pointer),
    }
  },
  maxLines: MAX_LINES,
  maxDots: MAX_DOTS,
}

export const TeamFigure = makeAnimation('TeamFigure', teamScene)
