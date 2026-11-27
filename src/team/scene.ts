// NOTE: the team figure as a blog animation, drawn by the kit in
// src/blog/animation.

import { makeAnimation } from '../blog/animation/Animation.ts'
import type { Scene } from '../blog/animation/scene.ts'
import { buildTimeline, frameAt } from './rhythm.ts'
import { MAX_DOTS, MAX_LINES, shapesOf } from './shapes.ts'

export const teamScene: Scene = {
  variants: [
    {
      id: 'team',
      label: 'TEAM',
      // The canvas has no words of its own, so the caption names the
      // flare and the line along the bottom.
      caption:
        'A team falling into rhythm over a season. Each beat they land together adds a little trust. One flare of frustration takes it all at once, and the line along the bottom shows how little comes back.',
      tone: 'hi',
    },
  ],
  run: (_variant, seed) => {
    const timeline = buildTimeline(seed)
    return {
      end: timeline.end,
      shapesAt: (time, width, height, pointer) => shapesOf(frameAt(timeline, time), width, height, pointer),
    }
  },
  maxLines: MAX_LINES,
  maxDots: MAX_DOTS,
}

export const TeamFigure = makeAnimation('TeamFigure', teamScene)
