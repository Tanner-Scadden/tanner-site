// NOTE: the network diagram as a blog animation, drawn by the kit in
// src/blog/animation.

import { makeAnimation } from '../blog/animation/Animation.ts'
import { Array as Arr, Option } from 'effect'

import { type Interaction, type Scene, rememberLast } from '../blog/animation/scene.ts'
import { MAX_TEARS, TEAR_SETTLE, buildTimeline, frameAt, tearsOf } from './graph.ts'
import { MAX_DOTS, MAX_LINES, projection, shapesOf } from './shapes.ts'

// Where an aim lands in the world. The canvas is always 16:9, so any size
// of it will do.
const AIM_SIZE = { width: 1600, height: 900 } as const
const worldOf = ([u, v]: readonly [number, number]): readonly [number, number] => {
  const [ox, oy] = projection(AIM_SIZE.width, AIM_SIZE.height)([0, 0])
  const [ux] = projection(AIM_SIZE.width, AIM_SIZE.height)([1, 0])
  const scale = ux - ox
  return [(u * AIM_SIZE.width - ox) / scale, (v * AIM_SIZE.height - oy) / scale]
}

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
    const tears = rememberLast((interactions: ReadonlyArray<Interaction>) =>
      tearsOf(
        timeline,
        Arr.map(interactions, ({ time, aim }) => ({ time, aim: Option.map(aim, worldOf) })),
      ),
    )
    return {
      end: timeline.end,
      shapesAt: (time, width, height, pointer, interactions) =>
        shapesOf(frameAt(timeline, time, tears(interactions)), width, height, pointer),
    }
  },
  maxLines: MAX_LINES,
  maxDots: MAX_DOTS,
  // A bad interaction: you let someone you helped down.
  interact: { hint: 'Have a bad interaction with someone you helped', settle: TEAR_SETTLE, max: MAX_TEARS },
}

export const NetworkFigure = makeAnimation('NetworkFigure', networkScene)
