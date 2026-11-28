import { Option } from 'effect'

import { makeAnimation } from '../../animation/Animation.ts'
import { worldOfAim } from '../../animation/kit.ts'
import { type Interaction, type Scene, rememberLast } from '../../animation/scene.ts'
import {
  MAX_PRESSES,
  SETTLE,
  SWITCHBOARD_DOTS,
  SWITCHBOARD_LINES,
  buildSwitchboard,
  switchboardShapes,
  withReader,
} from './switchboard.ts'
import { projection } from './world.ts'

const worldOf = worldOfAim(projection)

// Be Someone Worth Calling's hero: the call coming in on a switchboard. It
// plays once and rests on the lit board, with a caption that says what the
// cords are.
export const callingScene: Scene = {
  variants: [
    {
      id: 'switchboard',
      label: 'SWITCHBOARD',
      caption:
        'Every cord is someone who knows your work. Enough of them, and a call you never wired for comes in. Drag a cord to unplug it.',
      tone: 'hi',
    },
  ],
  run: (_variant, seed) => {
    const board = buildSwitchboard(seed)
    const cords = rememberLast((interactions: ReadonlyArray<Interaction>) => withReader(board, interactions, worldOf))
    return {
      end: board.end,
      shapesAt: (time, width, height, pointer, interactions, held = Option.none()) =>
        switchboardShapes(board, cords(interactions), time, width, height, pointer, held),
    }
  },
  maxLines: SWITCHBOARD_LINES,
  maxDots: SWITCHBOARD_DOTS,
  interact: { hint: 'Grab a cord by its end and pull it out, or plug it in somewhere else', settle: SETTLE, max: MAX_PRESSES },
  drag: true,
  once: true,
}

export const CallingHero = makeAnimation('CallingHero', callingScene, { hero: true })
