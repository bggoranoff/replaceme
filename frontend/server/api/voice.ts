import type { Route } from './http.ts'

// Owner: voice agent. shared/game_contract.md section h. GRADIUM_API_KEY stays server-side.
//   POST /api/stt   body: audio (Content-Type audio/webm|audio/wav|...) -> {text}
//   POST /api/tts   {text, voice?} -> audio bytes (Content-Type audio/*)
export const routes: Route[] = []
