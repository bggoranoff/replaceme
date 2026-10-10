// The one scoring engine for every mechanic (shared/actions.json scoring_spec).
// Deterministic and side-effect free: the same inputs always give the same score.
// builder/scoring.py mirrors these formulas exactly.
import type { LevelResult } from '../contract'
import type { DeliveryOrder, Level, NumericTerm, Scoring, SortItem } from './types'

// ---------------------------------------------------------------------------
// Safe arithmetic expressions (no eval):
//   expr := term (('+'|'-') term)* ; term := factor (('*'|'/') factor)*
//   factor := NUMBER | VAR_ID | '(' expr ')' | '-' factor ; VAR_ID := [a-z][a-z0-9_]*
// ---------------------------------------------------------------------------

export type Expr =
  | { k: 'num'; v: number }
  | { k: 'var'; id: string }
  | { k: 'neg'; e: Expr }
  | { k: 'bin'; op: '+' | '-' | '*' | '/'; a: Expr; b: Expr }

type Token = { t: 'num'; v: number } | { t: 'id'; v: string } | { t: 'op'; v: string }

function tokenize(src: string): Token[] {
  const out: Token[] = []
  let i = 0
  while (i < src.length) {
    const c = src[i]
    if (c === ' ') {
      i++
    } else if ('+-*/()'.includes(c)) {
      out.push({ t: 'op', v: c })
      i++
    } else if (/[0-9.]/.test(c)) {
      const m = /^(\d+(\.\d+)?|\.\d+)/.exec(src.slice(i))
      if (!m) throw new Error(`bad number at ${i} in "${src}"`)
      out.push({ t: 'num', v: Number(m[0]) })
      i += m[0].length
    } else if (/[a-z]/.test(c)) {
      const m = /^[a-z][a-z0-9_]*/.exec(src.slice(i))!
      out.push({ t: 'id', v: m[0] })
      i += m[0].length
    } else {
      throw new Error(`unexpected "${c}" in "${src}"`)
    }
  }
  return out
}

export function parseExpr(src: string, varIds?: Iterable<string>): Expr {
  const allowed = varIds ? new Set(varIds) : null
  const toks = tokenize(src)
  let p = 0
  const peek = () => toks[p]
  const isOp = (v: string) => peek()?.t === 'op' && peek()!.v === v

  const factor = (): Expr => {
    const tok = toks[p++]
    if (!tok) throw new Error(`unexpected end of "${src}"`)
    if (tok.t === 'num') return { k: 'num', v: tok.v }
    if (tok.t === 'id') {
      if (allowed && !allowed.has(tok.v)) throw new Error(`unknown variable "${tok.v}" in "${src}"`)
      return { k: 'var', id: tok.v }
    }
    if (tok.v === '-') return { k: 'neg', e: factor() }
    if (tok.v === '(') {
      const e = expr()
      if (!isOp(')')) throw new Error(`missing ) in "${src}"`)
      p++
      return e
    }
    throw new Error(`unexpected "${tok.v}" in "${src}"`)
  }
  const term = (): Expr => {
    let a = factor()
    while (isOp('*') || isOp('/')) {
      const op = toks[p++].v as '*' | '/'
      a = { k: 'bin', op, a, b: factor() }
    }
    return a
  }
  const expr = (): Expr => {
    let a = term()
    while (isOp('+') || isOp('-')) {
      const op = toks[p++].v as '+' | '-'
      a = { k: 'bin', op, a, b: term() }
    }
    return a
  }
  const e = expr()
  if (p !== toks.length) throw new Error(`trailing input in "${src}"`)
  return e
}

/** Returns null on division by zero or a non-finite result. */
export function evalExpr(e: Expr, values: Record<string, number>): number | null {
  switch (e.k) {
    case 'num':
      return e.v
    case 'var': {
      const v = values[e.id]
      return typeof v === 'number' && Number.isFinite(v) ? v : null
    }
    case 'neg': {
      const v = evalExpr(e.e, values)
      return v === null ? null : -v
    }
    case 'bin': {
      const a = evalExpr(e.a, values)
      const b = evalExpr(e.b, values)
      if (a === null || b === null) return null
      if (e.op === '/' && b === 0) return null
      const r = e.op === '+' ? a + b : e.op === '-' ? a - b : e.op === '*' ? a * b : a / b
      return Number.isFinite(r) ? r : null
    }
  }
}

// ---------------------------------------------------------------------------
// Numeric terms
// ---------------------------------------------------------------------------

/** Half-up rounding, identical in builder/scoring.py. */
export const round1 = (x: number) => Math.floor(x * 10 + 0.5) / 10
export const round0 = (x: number) => Math.floor(x + 0.5)

export function deviation(term: NumericTerm, value: number): number {
  if (term.range) {
    const [lo, hi] = term.range
    return value < lo ? lo - value : value > hi ? value - hi : 0
  }
  return Math.abs(value - (term.target ?? 0))
}

export function curveScore(term: NumericTerm, d: number): number {
  const tol = term.tolerance
  if (term.curve === 'linear') return Math.max(0, 1 - d / (2 * tol))
  if (term.curve === 'step') return d <= tol ? 1 : 0
  return Math.exp(-0.5 * (d / tol) ** 2)
}

function isLow(term: NumericTerm, value: number | null): boolean {
  if (value === null) return true
  return term.range ? value < term.range[0] : value < (term.target ?? 0)
}

interface Scored {
  id: string
  label: string
  weight: number
  s: number
  message: string | null
}

function finish(scored: Scored[], passThreshold: number, successLine: string, extraCap?: number): LevelResult {
  const wsum = scored.reduce((a, t) => a + t.weight, 0)
  let score = wsum > 0 ? round1((100 * scored.reduce((a, t) => a + t.weight * t.s, 0)) / wsum) : 0
  if (extraCap !== undefined) score = Math.min(score, extraCap)
  const feedback = scored
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => t.s < 0.8 && t.message)
    .sort((a, b) => b.t.weight * (1 - b.t.s) - a.t.weight * (1 - a.t.s) || a.i - b.i)
    .slice(0, 3)
    .map(({ t }) => t.message as string)
  const breakdown: LevelResult['breakdown'] = {}
  for (const t of scored) breakdown[t.id] = { label: t.label, score: round0(100 * t.s) }
  return {
    score,
    passed: score >= passThreshold,
    feedback: feedback.length ? feedback : [successLine],
    breakdown,
  }
}

const successOf = (level: Level) => level.success_line || 'Well done!'

/**
 * mix (values = variable values) and timing (values = phase values; missing = unfinished, scores 0).
 * labels maps variable/phase id to its display label.
 */
export function scoreNumeric(
  scoring: Scoring,
  values: Record<string, number | undefined>,
  labels: Record<string, string>,
  successLine: string,
  addedOrder?: string[],
): LevelResult {
  const scored: Scored[] = []
  const known: Record<string, number> = {}
  for (const [k, v] of Object.entries(values)) if (typeof v === 'number') known[k] = v
  for (const [id, term] of Object.entries(scoring.variables ?? {})) {
    const v = values[id]
    const s = typeof v === 'number' ? curveScore(term, deviation(term, v)) : 0
    const value = typeof v === 'number' ? v : null
    scored.push({ id, label: labels[id] ?? id, weight: term.weight, s, message: isLow(term, value) ? term.feedback.too_low : term.feedback.too_high })
  }
  for (const term of scoring.derived ?? []) {
    let value: number | null = null
    try {
      value = evalExpr(parseExpr(term.expr), known)
    } catch {
      value = null
    }
    const s = value === null ? 0 : curveScore(term, deviation(term, value))
    scored.push({ id: term.id, label: term.label, weight: term.weight, s, message: isLow(term, value) ? term.feedback.too_low : term.feedback.too_high })
  }
  if (scoring.order && addedOrder) {
    const exp = scoring.order.expected
    const same = exp.length === addedOrder.length && exp.every((x, i) => x === addedOrder[i])
    scored.push({ id: 'order', label: 'Order', weight: scoring.order.weight, s: same ? 1 : 0, message: scoring.order.feedback })
  }
  return finish(scored, scoring.pass_threshold, successLine)
}

export function scoreMix(level: Level, values: Record<string, number>, addedOrder: string[] = []): LevelResult {
  const vars = (level.params.variables as { id: string; label: string }[]) ?? []
  const labels = Object.fromEntries(vars.map((v) => [v.id, v.label]))
  const hasIngredients = Array.isArray(level.params.ingredients) && (level.params.ingredients as unknown[]).length > 0
  return scoreNumeric(level.scoring, values, labels, successOf(level), hasIngredients ? addedOrder : undefined)
}

export function scoreTiming(level: Level, results: Record<string, number | undefined>): LevelResult {
  const phases = (level.params.phases as { id: string; label: string }[]) ?? []
  const labels = Object.fromEntries(phases.map((p) => [p.id, p.label]))
  const values: Record<string, number | undefined> = {}
  for (const p of phases) values[p.id] = results[p.id]
  return scoreNumeric(level.scoring, values, labels, successOf(level))
}

/** placed maps item id to bin id; unplaced items count wrong. */
export function scoreSort(level: Level, placed: Record<string, string>): LevelResult {
  const items = (level.params.items as SortItem[]) ?? []
  const correct = level.scoring.correct ?? {}
  const weights = level.scoring.weights ?? {}
  const fb = level.scoring.feedback ?? {}
  const scored: Scored[] = items.map((it) => ({
    id: it.id,
    label: it.label,
    weight: typeof weights[it.id] === 'number' && weights[it.id] > 0 ? weights[it.id] : 1,
    s: placed[it.id] !== undefined && placed[it.id] === correct[it.id] ? 1 : 0,
    message: placed[it.id] === undefined ? `${it.label} was never put away.` : fb[it.id] || `${it.label} ended up in the wrong place.`,
  }))
  return finish(scored, level.scoring.pass_threshold, successOf(level))
}

export type OrderStatus = 'waiting' | 'carrying' | 'delivered' | 'wrong'

export function scoreDeliver(level: Level, statuses: Record<string, OrderStatus>, tMs: number): LevelResult {
  const orders = (level.params.orders as DeliveryOrder[]) ?? []
  const par = Number(level.params.par_ms) || 0
  const limit = level.time_limit_ms ?? par * 2
  const weights = level.scoring.weights ?? {}
  const fb = level.scoring.feedback ?? {}
  const ow = (o: DeliveryOrder) => (typeof weights[o.id] === 'number' && weights[o.id] > 0 ? weights[o.id] : 1)
  const wsum = orders.reduce((a, o) => a + ow(o), 0)
  const accuracy = wsum > 0 ? orders.reduce((a, o) => a + (statuses[o.id] === 'delivered' ? ow(o) : 0), 0) / wsum : 0
  const time = tMs <= par ? 1 : limit > par ? Math.max(0, 1 - (tMs - par) / (limit - par)) : 0
  const wa = weights.accuracy ?? 1
  const wt = weights.time ?? 1
  const score = round1((100 * (wa * accuracy + wt * time)) / (wa + wt))
  const feedback: string[] = []
  if (orders.some((o) => statuses[o.id] === 'wrong')) feedback.push(fb.wrong_target || 'Something went to the wrong place.')
  if (orders.some((o) => statuses[o.id] === 'waiting' || statuses[o.id] === 'carrying')) feedback.push(fb.missed || 'Not every order arrived.')
  if (tMs > par) feedback.push(fb.late || 'That took a while.')
  return {
    score,
    passed: score >= level.scoring.pass_threshold,
    feedback: feedback.length ? feedback.slice(0, 3) : [successOf(level)],
    breakdown: {
      accuracy: { label: 'Right place', score: round0(100 * accuracy) },
      time: { label: 'Speed', score: round0(100 * time) },
    },
  }
}

/** chosen maps turn id to option id. ended: 'complete' | 'critical' | 'timeout'. */
export function scoreConverse(level: Level, chosen: Record<string, string>, ended: 'complete' | 'critical' | 'timeout'): LevelResult {
  const turns = (level.params.turns as { id: string; npc_line: string }[]) ?? []
  const spec = level.scoring.turns ?? {}
  const considered = ended === 'critical' ? turns.filter((t) => chosen[t.id] !== undefined) : turns
  const scored: Scored[] = considered.map((t, i) => {
    const opt = chosen[t.id] !== undefined ? spec[t.id]?.[chosen[t.id]] : undefined
    return {
      id: t.id,
      label: `Reply ${i + 1}`,
      weight: 1,
      s: opt ? Math.max(0, Math.min(1, opt.points)) : 0,
      message: opt ? opt.feedback : 'You left them waiting for an answer.',
    }
  })
  const cap = ended === 'critical' ? level.scoring.pass_threshold - 1 : undefined
  const res = finish(scored, level.scoring.pass_threshold, successOf(level), cap)
  if (ended === 'critical') res.passed = false
  return res
}
