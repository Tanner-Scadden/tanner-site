// NOTE: the network diagram as a blog animation, drawn by the kit in
// src/blog/animation.

import { makeAnimation } from '../blog/animation/Animation.ts'
import type { Scene } from '../blog/animation/scene.ts'
import { buildTimeline, frameAt } from './graph.ts'
import { MAX_DOTS, MAX_LINES, shapesOf } from './shapes.ts'

export const networkScene: Scene = {
  variants: [
    {
      id: 'good',
      label: 'HIGH IMPACT',
      // The second sentence names the late beat, since the canvas has no
      // words of its own.
      caption:
        "Network over time as you have high impact on people's lives. When you jump, the calls come back through it.",
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

export const NetworkFigure = makeAnimation('NetworkFigure', networkScene)
