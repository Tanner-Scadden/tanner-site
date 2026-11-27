// NOTE: the network diagram as a blog animation: two variants of the same
// story, drawn by the kit in src/blog/animation.

import { makeAnimation } from '../blog/animation/Animation.ts'
import type { Scene } from '../blog/animation/scene.ts'
import { MAX_EDGES, MAX_NODES, type Mode, buildTimeline, frameAt } from './graph.ts'
import { shapesOf } from './shapes.ts'

export const networkScene: Scene = {
  variants: [
    {
      id: 'good',
      label: 'HIGH IMPACT',
      caption: "Network over time as you have high impact on people's lives",
      tone: 'hi',
    },
    {
      id: 'bad',
      label: 'NEGATIVE IMPACT',
      caption: "Network over time as you have negative impact on people's lives",
      tone: 'alarm',
    },
  ],
  run: (variant, seed) => {
    const mode: Mode = variant === 'bad' ? 'bad' : 'good'
    const timeline = buildTimeline(seed, mode)
    return {
      end: timeline.end,
      shapesAt: (time, width, height, pointer) => shapesOf(frameAt(timeline, time), width, height, pointer),
    }
  },
  // A snapping link is two lines. Dots: everyone, their rings, the picked
  // person's ring, and you walking.
  maxLines: MAX_EDGES * 2,
  maxDots: MAX_NODES * 2 + 2,
}

export const NetworkFigure = makeAnimation('NetworkFigure', networkScene)
