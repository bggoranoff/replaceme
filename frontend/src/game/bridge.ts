// window.__replaceme (shared/game_contract.md section c): the actor plays only through this.
import type { ReplacemeBridge } from '../contract'
import { ActionError, type GameEngine } from './engine'

declare global {
  interface Window {
    __replaceme?: ReplacemeBridge
  }
}

export function installBridge(engine: GameEngine): () => void {
  const bridge: ReplacemeBridge = {
    listActions: () => engine.listActions(),
    observe: () => engine.observe(),
    act: async (action) => engine.act(action),
    onEvent: (cb) => engine.onEvent(cb),
    resetLevel: async (levelId) => {
      try {
        engine.resetLevel(levelId)
      } catch (err) {
        if (err instanceof ActionError) throw new Error(err.message)
        throw err
      }
      return engine.observe()
    },
  }
  window.__replaceme = bridge
  return () => {
    if (window.__replaceme === bridge) delete window.__replaceme
  }
}
