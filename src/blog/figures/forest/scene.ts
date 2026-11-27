// NOTE: the grove as a blog animation, drawn by the kit in
// src/blog/animation.

import { Array as Arr, Option } from 'effect'

import { makeAnimation } from '../../animation/Animation.ts'
import { worldOfAim } from '../../animation/kit.ts'
import { type Interaction, type Scene, rememberLast } from '../../animation/scene.ts'
import { MAX_PLANTS, PLANT_SETTLE, buildTimeline, frameAt, plantedIn } from './grove.ts'
import { MAX_DOTS, MAX_LINES, projection, shapesOf } from './shapes.ts'

// Where across the ground an aim lands.
const worldOf = worldOfAim(projection)
const groundXOf = (aim: readonly [number, number]): number => worldOf(aim)[0]

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
