import { Array as Arr, Option } from 'effect'

import { makeAnimation } from '../../animation/Animation.ts'
import { worldOfAim } from '../../animation/kit.ts'
import { type Interaction, type Scene, rememberLast } from '../../animation/scene.ts'
import { MAX_TEARS, TEAR_SETTLE, buildTimeline, frameAt, tearsOf } from './graph.ts'
import { MAX_DOTS, MAX_LINES, projection, shapesOf } from './shapes.ts'

const worldOf = worldOfAim(projection)

export const networkScene: Scene = {
  variants: [
    {
      id: 'network',
      label: 'HIGH IMPACT',
      caption: '',
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
