import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { AgentPage } from './game'
import './App.css'

// Agent mode (shared/game_contract.md section c): /?slug=&level=&run=&agent=1 renders only the game.
const query = new URLSearchParams(window.location.search)
const agentSlug = query.get('agent') === '1' ? query.get('slug') : null

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {agentSlug ? <AgentPage slug={agentSlug} levelId={query.get('level')} /> : <App />}
  </StrictMode>,
)
