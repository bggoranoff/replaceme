import type { World } from './types'

/** GET /api/world?slug= (game_contract.md section i). */
export async function fetchWorld(slug: string): Promise<World> {
  const res = await fetch(`/api/world?slug=${encodeURIComponent(slug)}`)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error ?? `World ${slug} not found (${res.status})`)
  return data as World
}
