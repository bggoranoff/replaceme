import type { IncomingMessage, ServerResponse } from 'node:http'

/** Context every /api route gets. Keys stay server-side: never send env values to the browser. */
export interface ApiContext {
  repoRoot: string
  env: Record<string, string>
}

export type ApiHandler = (
  req: IncomingMessage,
  res: ServerResponse,
  ctx: ApiContext,
  params: Record<string, string>,
) => void | Promise<void>

/** path uses :name segments, e.g. '/api/runs/:id/events'. */
export interface Route {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  path: string
  handler: ApiHandler
}

export class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

export function readBody(req: IncomingMessage, maxBytes = 25_000_000): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > maxBytes) {
        reject(new HttpError(413, 'Request body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

export async function readJson<T = Record<string, unknown>>(req: IncomingMessage): Promise<T> {
  const raw = (await readBody(req)).toString('utf8')
  try {
    return (raw ? JSON.parse(raw) : {}) as T
  } catch {
    throw new HttpError(400, 'Body must be valid JSON')
  }
}
