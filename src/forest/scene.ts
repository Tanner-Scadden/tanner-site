// NOTE: the grove as a blog animation, drawn by the kit in
// src/blog/animation.

import { makeAnimation } from '../blog/animation/Animation.ts'
import type { Scene } from '../blog/animation/scene.ts'
import { buildTimeline, frameAt } from './grove.ts'
import { MAX_DOTS, MAX_LINES, shapesOf } from './shapes.ts'

export const forestScene: Scene = {
  variants: [
    {
      id: 'grove',
      label: 'ONE SEED',
      caption: 'One seed, then a forest. For "The Lorax" by Dr. Seuss, which ends with one last seed handed on.',
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

export const ForestFigure = makeAnimation('ForestFigure', forestScene)
