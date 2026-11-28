import { makeAnimation } from '../../animation/Animation.ts'
import { worldOfAim } from '../../animation/kit.ts'
import type { Scene } from '../../animation/scene.ts'
import { MINIMAP_DOTS, MINIMAP_LINES, buildMinimap, minimapShapes } from './minimap.ts'
import {
  MAX_PRESSES,
  SETTLE,
  SWITCHBOARD_DOTS,
  SWITCHBOARD_LINES,
  buildSwitchboard,
  switchboardShapes,
} from './switchboard.ts'
import { projection } from './world.ts'

const worldOf = worldOfAim(projection)

// Be Someone Worth Calling's hero: the call coming in, two ways.
export const callingScene: Scene = {
  variants: [
    { id: 'minimap', label: 'MINIMAP', caption: '', tone: 'hi' },
    { id: 'switchboard', label: 'SWITCHBOARD', caption: '', tone: 'hi' },
  ],
  run: (variant, seed) => {
    if (variant === 'switchboard') {
      const board = buildSwitchboard(seed)
      return {
        end: board.end,
        shapesAt: (time, width, height, _pointer, interactions) =>
          switchboardShapes(board, time, width, height, interactions, worldOf),
      }
    }
    const map = buildMinimap(seed)
    return {
      end: map.end,
      shapesAt: (time, width, height, _pointer, interactions) =>
        minimapShapes(map, time, width, height, interactions, worldOf),
    }
  },
  maxLines: Math.max(MINIMAP_LINES, SWITCHBOARD_LINES),
  maxDots: Math.max(MINIMAP_DOTS, SWITCHBOARD_DOTS),
  interact: { hint: 'Ping the map, or put a cord up', settle: SETTLE, max: MAX_PRESSES },
}

export const CallingHero = makeAnimation('CallingHero', callingScene, { hero: true })
