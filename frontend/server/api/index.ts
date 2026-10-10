import type { IncomingMessage, ServerResponse } from 'node:http'
import { HttpError, sendJson, type ApiContext, type Route } from './http.ts'
import { routes as progressRoutes } from './progress.ts'
import { routes as runsRoutes } from './runs.ts'
import { routes as skillsRoutes } from './skills.ts'
import { routes as trainRoutes } from './train.ts'
import { routes as voiceRoutes } from './voice.ts'

// Each feature owns one file in this folder exporting `routes: Route[]`; edit only your file.
// A new file adds ONE import and ONE spread here. See shared/game_contract.md section j.
export const routes: Route[] = [...trainRoutes, ...runsRoutes, ...skillsRoutes, ...voiceRoutes, ...progressRoutes]

function match(pattern: string, pathname: string): Record<string, string> | null {
  const a = pattern.split('/')
  const b = pathname.split('/')
  if (a.length !== b.length) return null
  const params: Record<string, string> = {}
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith(':')) params[a[i].slice(1)] = decodeURIComponent(b[i])
    else if (a[i] !== b[i]) return null
  }
  return params
}

/** Returns true if a registered route handled the request. */
export function dispatch(req: IncomingMessage, res: ServerResponse, ctx: ApiContext): boolean {
  const pathname = (req.url ?? '').split('?')[0]
  for (const route of routes) {
    if (route.method !== req.method) continue
    const params = match(route.path, pathname)
    if (!params) continue
    void (async () => {
      try {
        await route.handler(req, res, ctx, params)
      } catch (err) {
        if (res.headersSent) return res.end()
        sendJson(res, err instanceof HttpError ? err.status : 500, { error: (err as Error).message ?? 'Internal error' })
      }
    })()
    return true
  }
  return false
}
