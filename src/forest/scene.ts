// NOTE: the grove as a blog animation, drawn by the kit in
// src/blog/animation.

import { makeAnimation } from '../blog/animation/Animation.ts'
import { Array as Arr, Option } from 'effect'

import { type Interaction, type Scene, rememberLast } from '../blog/animation/scene.ts'
import { MAX_PLANTS, PLANT_SETTLE, buildTimeline, frameAt, plantedIn } from './grove.ts'
import { MAX_DOTS, MAX_LINES, projection, shapesOf } from './shapes.ts'

// Where across the ground an aim lands. The canvas is always 16:9, so any
// size of it will do.
const AIM_SIZE = { width: 1600, height: 900 } as const
const groundXOf = ([u]: readonly [number, number]): number => {
  const { scale, px } = projection(AIM_SIZE.width, AIM_SIZE.height)
  return (u * AIM_SIZE.width - px([0, 0])[0]) / scale
}

export const forestScene: Scene = {
  variants: [
    {
      id: 'grove',
      label: 'ONE SEED',
      // The quote above it says what it's for.
      caption: '',
      tone: 'hi',
    },
  ],
  run: (_variant, seed) => {
    const timeline = buildTimeline(seed)
    const planted = rememberLast((interactions: ReadonlyArray<Interaction>) =>
      interactions.length === 0
        ? timeline
        : plantedIn(
            timeline,
            Arr.map(interactions, ({ time, aim }) => ({ time, aim: Option.map(aim, groundXOf) })),
          ),
    )
    return {
      end: timeline.end,
      shapesAt: (time, width, height, pointer, interactions) =>
        shapesOf(frameAt(planted(interactions), time), width, height, pointer),
    }
  },
  maxLines: MAX_LINES,
  maxDots: MAX_DOTS,
  // A hopeful one: plant another seed.
  interact: { hint: 'Plant another seed', settle: PLANT_SETTLE, max: MAX_PLANTS },
}

export const ForestFigure = makeAnimation('ForestFigure', forestScene)
