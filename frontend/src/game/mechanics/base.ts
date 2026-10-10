import type { ControlId, LevelResult, MechanicId, Target } from '../../contract'
import type { Level, World } from '../types'

export type Dir = 'up' | 'down' | 'left' | 'right'

/** What a mechanic may ask of the engine. */
export interface MechanicCtx {
  world: World
  level: Level
  W: number
  H: number
  /** Level time in ms since the level started. */
  now(): number
  emit(type: 'pickup' | 'handover' | 'placed' | 'phase_end', data: Record<string, unknown>): void
  say(npcId: string | null, text: string): void
  finish(result: LevelResult): void
  /** World-walking helpers, used by the deliver mechanic. */
  walk(dir: Dir): void
  avatarTile(): [number, number]
}

export interface Mechanic {
  readonly kind: MechanicId
  /** Every clickable/interactable thing, in viewport coordinates. */
  targets(): Target[]
  focus(): string | null
  /** Called once when the level enters the playing phase. */
  start(): void
  dir(d: Dir): void
  /** key_up with hold semantics (timing hold phases). Return true if handled. */
  holdStart(): boolean
  holdEnd(): void
  interact(targetId?: string): void
  click(x: number, y: number): void
  down(x: number, y: number): void
  move(x: number, y: number): void
  up(x: number, y: number): void
  advance(): void
  observe(): Record<string, unknown>
  /** Result when the time limit runs out. */
  timeout(): LevelResult
}

export interface ControlInfo {
  action: ControlId
  description: string
}

/** actions.json mechanics.<id>.controls with each control's meaning in that mechanic. */
export const MECHANIC_CONTROLS: Record<MechanicId, ControlInfo[]> = {
  mix: [
    { action: 'key_up', description: 'select the previous variable' },
    { action: 'key_down', description: 'select the next variable' },
    { action: 'key_left', description: 'decrease the selected variable by one step per press step' },
    { action: 'key_right', description: 'increase the selected variable by one step per press step' },
    { action: 'mouse_click', description: 'click slider:<var_id> to set the value at that x (value = min + (x - target.x) / target.w * (max - min), snapped to step), ingredient:<id> to add it, submit to score' },
    { action: 'mouse_drag', description: 'drag on slider:<var_id> to set the value at the drop x' },
    { action: 'interact', description: 'submit and score the current values' },
  ],
  timing: [
    { action: 'key_up', description: "stop mode: stop the needle now. hold mode: hold for hold_ms then release (value = min + fill_per_s * hold_ms / 1000)" },
    { action: 'mouse_down', description: 'hold mode: start holding on the meter. stop mode: stop the needle now' },
    { action: 'mouse_up', description: 'hold mode: release (ends the phase)' },
    { action: 'mouse_click', description: 'stop mode: click the meter to stop the needle' },
    { action: 'interact', description: 'stop mode: stop the needle now' },
    { action: 'wait', description: 'let time pass (the needle keeps moving, a held meter keeps filling; after each phase the meter pauses for mechanic_state.pause_ms)' },
  ],
  sort: [
    { action: 'key_left', description: 'select the previous bin' },
    { action: 'key_right', description: 'select the next bin' },
    { action: 'key_down', description: 'drop the current item in the selected bin' },
    { action: 'mouse_drag', description: 'drag item:<id> onto bin:<id>' },
    { action: 'mouse_click', description: 'click bin:<id> to drop the current item there' },
    { action: 'interact', description: 'drop the current item in the selected bin' },
  ],
  deliver: [
    { action: 'key_up', description: 'walk one tile up per press step' },
    { action: 'key_down', description: 'walk one tile down per press step' },
    { action: 'key_left', description: 'walk one tile left per press step' },
    { action: 'key_right', description: 'walk one tile right per press step' },
    { action: 'interact', description: 'next to the pickup: pick up the next order; next to a destination: hand over' },
    { action: 'mouse_click', description: 'click a tile to walk there (100 ms per tile), or a target to walk next to it and interact' },
    { action: 'wait', description: 'let time pass' },
  ],
  converse: [
    { action: 'key_up', description: 'select the previous answer' },
    { action: 'key_down', description: 'select the next answer' },
    { action: 'interact', description: 'say the selected answer' },
    { action: 'mouse_click', description: 'click choice:<option_id> to say it' },
  ],
}
