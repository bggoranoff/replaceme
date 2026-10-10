// Test-only stand-in for the game page: implements window.__replaceme (shared/game_contract.md section c)
// for the 5 mechanics with the actions.json scoring spec, in agent mode (virtual time). Not shipped.
(function () {
  const q = new URLSearchParams(location.search)
  const CONTROLS = {
    mix: ['key_up', 'key_down', 'key_left', 'key_right', 'mouse_click', 'mouse_drag', 'interact'],
    timing: ['key_up', 'mouse_down', 'mouse_up', 'mouse_click', 'interact', 'wait'],
    sort: ['key_left', 'key_right', 'key_down', 'mouse_drag', 'mouse_click', 'interact'],
    deliver: ['key_up', 'key_down', 'key_left', 'key_right', 'interact', 'mouse_click', 'wait'],
    converse: ['key_up', 'key_down', 'interact', 'mouse_click'],
  }
  const T = 16
  let world = null
  let level = null
  let S = null
  const listeners = []

  const curve = (d, tol, kind) =>
    kind === 'gaussian' ? Math.exp(-0.5 * (d / tol) ** 2) : kind === 'linear' ? Math.max(0, 1 - d / (2 * tol)) : d <= tol ? 1 : 0

  function evalExpr(expr, vars) {
    const toks = expr.match(/\d+\.?\d*|[a-z][a-z0-9_]*|[-+*/()]/g)
    let i = 0
    const peek = () => toks[i]
    const factor = () => {
      const t = toks[i++]
      if (t === '(') { const v = sum(); i++; return v }
      if (t === '-') return -factor()
      if (/^\d/.test(t)) return parseFloat(t)
      return vars[t]
    }
    const term = () => { let v = factor(); while (peek() === '*' || peek() === '/') { const op = toks[i++]; const r = factor(); if (op === '/' && r === 0) throw new Error('div0'); v = op === '*' ? v * r : v / r } return v }
    const sum = () => { let v = term(); while (peek() === '+' || peek() === '-') { const op = toks[i++]; const r = term(); v = op === '+' ? v + r : v - r } return v }
    return sum()
  }

  function numericScore(values, labels) {
    const sc = level.scoring
    const terms = Object.entries(sc.variables || {}).map(([id, t]) => ({ id, label: labels[id] || id, x: values[id], t }))
    for (const d of sc.derived || []) {
      let x = null
      try { x = evalExpr(d.expr, values) } catch { x = null }
      terms.push({ id: d.id, label: d.label, x, t: d })
    }
    return finish(terms.map(({ id, label, x, t }) => {
      if (x === null || x === undefined || Number.isNaN(x)) return { id, label, s: 0, w: t.weight, fb: t.feedback.too_low }
      let d, lowSide
      if (t.range) { d = x < t.range[0] ? t.range[0] - x : x > t.range[1] ? x - t.range[1] : 0; lowSide = x < t.range[0] }
      else { d = Math.abs(x - t.target); lowSide = x < t.target }
      return { id, label, s: curve(d, t.tolerance, t.curve), w: t.weight, fb: lowSide ? t.feedback.too_low : t.feedback.too_high }
    }))
  }

  function finish(terms, extraFeedback) {
    const sw = terms.reduce((a, t) => a + t.w, 0) || 1
    const score = Math.round((1000 * terms.reduce((a, t) => a + t.w * t.s, 0)) / sw) / 10
    const fb = extraFeedback || terms.filter((t) => t.s < 0.8).sort((a, b) => b.w * (1 - b.s) - a.w * (1 - a.s)).slice(0, 3).map((t) => t.fb)
    const breakdown = Object.fromEntries(terms.map((t) => [t.id, { label: t.label, score: Math.round(100 * t.s) }]))
    return { score, passed: score >= level.scoring.pass_threshold, feedback: fb.length ? fb : [level.success_line || 'Well done.'], breakdown }
  }

  function emit(ev) { S.events.push(ev); for (const cb of listeners) cb(ev) }

  function endLevel(result) {
    S.phase = 'result'
    S.done = true
    S.last_result = result
    emit({ type: 'level_result', t_ms: S.t, ...result })
  }

  function blocked() {
    const b = new Set()
    for (const s of world.map.solids) for (let x = s.x; x < s.x + s.w; x++) for (let y = s.y; y < s.y + s.h; y++) b.add(x + ',' + y)
    for (const n of world.npcs) b.add(n.tile[0] + ',' + n.tile[1])
    return b
  }

  function reset(levelId) {
    level = world.levels.find((l) => l.id === levelId)
    const p = level.params
    S = { t: 0, phase: 'playing', done: false, last_result: null, events: [], messages: [], avatar: [...world.map.spawn], facing: 'down' }
    if (level.mechanic === 'mix') { S.values = Object.fromEntries(p.variables.map((v) => [v.id, v.default])); S.sel = 0; S.added = [] }
    if (level.mechanic === 'timing') { S.phase_index = 0; S.phase_start = 0; S.results = []; S.holding = null }
    if (level.mechanic === 'sort') { S.item = 0; S.bin = 0; S.placed = [] }
    if (level.mechanic === 'converse') { S.turn = 0; S.sel = 0; S.history = []; S.points = [] }
    if (level.mechanic === 'deliver') { S.avatar = [...p.start_tile]; S.status = Object.fromEntries(p.orders.map((o) => [o.id, 'waiting'])); S.carrying = [] }
    emit({ type: 'level_start', t_ms: 0, level_id: levelId })
    return observe()
  }

  function meterValue(ph) {
    const t = S.t - S.phase_start
    if (ph.mode === 'stop') {
      const half = ph.period_ms / 2
      const k = t % ph.period_ms
      const f = k <= half ? k / half : 2 - k / half
      return ph.min + f * (ph.max - ph.min)
    }
    if (S.holding === null) return ph.min
    return Math.min(ph.max, ph.min + (ph.fill_per_s * (S.t - S.holding)) / 1000)
  }

  function targets() {
    const out = []
    const p = level.params
    if (level.mechanic === 'mix') {
      p.variables.forEach((v, i) => out.push({ id: `slider:${v.id}`, kind: 'slider', label: v.label, x: 100, y: 60 + i * 30, w: 300, h: 12, enabled: true }))
      for (const ing of p.ingredients || []) out.push({ id: `ingredient:${ing.id}`, kind: 'item', label: ing.label, x: 20, y: 60, w: 40, h: 20, enabled: true })
      out.push({ id: 'submit', kind: 'submit', label: p.submit_label, x: 200, y: 260, w: 100, h: 24, enabled: true })
    }
    if (level.mechanic === 'timing') out.push({ id: 'meter', kind: 'meter', label: 'meter', x: 150, y: 100, w: 200, h: 24, enabled: true })
    if (level.mechanic === 'sort') {
      p.bins.forEach((b, i) => out.push({ id: `bin:${b.id}`, kind: 'bin', label: b.label, x: 40 + i * 120, y: 220, w: 100, h: 60, enabled: true }))
      const it = p.items[S.item]
      if (it) out.push({ id: `item:${it.id}`, kind: 'item', label: it.label, x: 220, y: 80, w: 60, h: 40, enabled: true })
    }
    if (level.mechanic === 'converse') {
      const turn = p.turns[S.turn]
      if (turn) turn.options.forEach((o, i) => out.push({ id: `choice:${o.id}`, kind: 'choice', label: o.text, x: 60, y: 180 + i * 28, w: 380, h: 24, enabled: true }))
    }
    if (level.mechanic === 'deliver') {
      for (const l of world.map.locations) out.push({ id: `location:${l.id}`, kind: 'location', label: l.name, x: l.tile[0] * T, y: l.tile[1] * T, w: l.w * T, h: l.h * T, enabled: true })
      for (const n of world.npcs) out.push({ id: `npc:${n.id}`, kind: 'npc', label: n.name, x: n.tile[0] * T, y: n.tile[1] * T, w: T, h: T, enabled: true })
      for (const o of p.orders) {
        const from = out.find((t) => t.id === o.from)
        if (from && S.status[o.id] === 'waiting') out.push({ ...from, id: `spot:${o.id}`, kind: 'spot', label: o.label })
      }
    }
    return out
  }

  function mechanicState() {
    const p = level.params
    if (level.mechanic === 'mix') return { variables: p.variables.map((v) => ({ ...v, value: S.values[v.id] })), selected_index: S.sel, added_order: S.added }
    if (level.mechanic === 'timing') {
      const ph = p.phases[S.phase_index]
      return { phase_index: S.phase_index, phases_total: p.phases.length, results: S.results,
        meter: ph ? { id: ph.id, label: ph.label, unit: ph.unit, min: ph.min, max: ph.max, value: meterValue(ph), moving: ph.mode === 'stop', holding: S.holding !== null } : null }
    }
    if (level.mechanic === 'sort') {
      const it = p.items[S.item]
      return { current_item: it ? { id: it.id, label: it.label, attributes: it.attributes || {} } : null, queue_remaining: p.items.length - S.item,
        bins: p.bins, selected_bin: S.bin, placed: S.placed }
    }
    if (level.mechanic === 'converse') {
      const turn = p.turns[S.turn]
      const npc = world.npcs.find((n) => n.id === p.npc_id)
      return { npc: { id: npc.id, name: npc.name }, turn_index: turn ? S.turn : null, turns_total: p.turns.length, line: turn ? turn.npc_line : null,
        options: turn ? turn.options.map((o) => ({ id: o.id, text: o.text })) : [], selected_index: S.sel, history: S.history }
    }
    const orders = p.orders.map((o) => ({ id: o.id, label: o.label, to_label: labelOf(o.to), status: S.status[o.id] }))
    return { orders, carrying: S.carrying }
  }

  function labelOf(tid) { const t = targets().find((x) => x.id === tid); return t ? t.label : tid }

  function observe() {
    const b = blocked()
    return {
      level_id: level ? level.id : null, mechanic: level ? level.mechanic : null, phase: S ? S.phase : 'world', t_ms: S ? S.t : 0,
      time_limit_ms: level.time_limit_ms || null, time_left_ms: level.time_limit_ms ? Math.max(0, level.time_limit_ms - S.t) : null,
      aim: level.aim, controls_hint: level.controls_hint, viewport: { w: world.map.cols * T, h: world.map.rows * T },
      avatar: { x: S.avatar[0] * T + T / 2, y: S.avatar[1] * T + T / 2, tile: [...S.avatar], facing: S.facing, carrying: S.carrying && S.carrying.length ? S.carrying[0] : null },
      grid: { cols: world.map.cols, rows: world.map.rows, blocked: [...b].map((k) => k.split(',').map(Number)) },
      targets: targets(), focus: null, mechanic_state: mechanicState(), messages: S.messages.slice(-5), last_result: S.last_result, done: S.done,
    }
  }

  function listActions() {
    const names = S.phase === 'playing' ? CONTROLS[level.mechanic] : ['interact', 'mouse_click']
    return names.map((action) => ({ action, params: {}, description: action }))
  }

  const steps = (params) => 1 + Math.floor((params.hold_ms || 0) / 100)
  const COST = { mouse_click: 50 }

  function resolvePoint(pt) {
    if (pt && pt.target_id) { const t = targets().find((x) => x.id === pt.target_id); if (!t) throw new Error('unknown target ' + pt.target_id); return { x: t.x + t.w / 2, y: t.y + t.h / 2, target: t } }
    const t = targets().find((x) => pt.x >= x.x && pt.x <= x.x + x.w && pt.y >= x.y && pt.y <= x.y + x.h)
    return { x: pt.x, y: pt.y, target: t }
  }

  function applyMix(a, params) {
    const p = level.params
    const n = steps(params)
    if (a === 'key_up') S.sel = Math.max(0, S.sel - n)
    if (a === 'key_down') S.sel = Math.min(p.variables.length - 1, S.sel + n)
    if (a === 'key_left' || a === 'key_right') {
      const v = p.variables[S.sel]
      S.values[v.id] = Math.round(Math.min(v.max, Math.max(v.min, S.values[v.id] + (a === 'key_right' ? 1 : -1) * n * v.step)) * 1e6) / 1e6
    }
    const setFromPoint = (pt) => {
      if (!pt.target) return
      if (pt.target.id === 'submit') return submitMix()
      if (pt.target.id.startsWith('ingredient:')) return S.added.push(pt.target.id.slice(11))
      if (pt.target.id.startsWith('slider:')) {
        const v = p.variables.find((x) => x.id === pt.target.id.slice(7))
        const f = Math.min(1, Math.max(0, (pt.x - pt.target.x) / pt.target.w))
        S.values[v.id] = Math.round((v.min + Math.round((f * (v.max - v.min)) / v.step) * v.step) * 1e6) / 1e6
      }
    }
    if (a === 'mouse_click') setFromPoint(resolvePoint(params))
    if (a === 'mouse_drag') setFromPoint(resolvePoint(params.to))
    if (a === 'interact') submitMix()
  }

  function submitMix() {
    const labels = Object.fromEntries(level.params.variables.map((v) => [v.id, v.label]))
    endLevel(numericScore(S.values, labels))
  }

  function applyTiming(a, params) {
    const ph = level.params.phases[S.phase_index]
    const stopNow = () => {
      S.results.push({ id: ph.id, value: Math.round(meterValue(ph) * 1000) / 1000 })
      S.holding = null
      emit({ type: 'phase_end', t_ms: S.t, phase_id: ph.id })
      S.phase_index++
      S.phase_start = S.t
      if (S.phase_index >= level.params.phases.length) {
        const values = Object.fromEntries(S.results.map((r) => [r.id, r.value]))
        endLevel(numericScore(values, Object.fromEntries(level.params.phases.map((x) => [x.id, x.label]))))
      }
    }
    if (ph.mode === 'stop' && (a === 'interact' || a === 'key_up' || a === 'mouse_click')) {
      stopNow()
      if (a === 'key_up') S.t += 100
      return
    }
    if (ph.mode === 'hold') {
      if (a === 'mouse_down') S.holding = S.t
      if (a === 'mouse_up' && S.holding !== null) return stopNow()
      if (a === 'key_up') { S.holding = S.t; S.t += params.hold_ms > 0 ? params.hold_ms : 100; return stopNow() }
    }
  }

  function applySort(a, params) {
    const p = level.params
    const n = steps(params)
    if (a === 'key_left') S.bin = Math.max(0, S.bin - n)
    if (a === 'key_right') S.bin = Math.min(p.bins.length - 1, S.bin + n)
    const drop = (binId) => {
      const it = p.items[S.item]
      if (!it) return
      S.placed.push({ item_id: it.id, bin_id: binId })
      emit({ type: 'placed', t_ms: S.t, item_id: it.id, bin_id: binId })
      S.item++
      if (S.item >= p.items.length) scoreSort()
    }
    if (a === 'key_down' || a === 'interact') drop(p.bins[S.bin].id)
    if (a === 'mouse_click' && params.target_id && params.target_id.startsWith('bin:')) drop(params.target_id.slice(4))
    if (a === 'mouse_drag' && params.to && params.to.target_id && params.to.target_id.startsWith('bin:')) drop(params.to.target_id.slice(4))
  }

  function scoreSort() {
    const sc = level.scoring
    let num = 0
    let den = 0
    const fb = []
    for (const it of level.params.items) {
      const w = (sc.weights || {})[it.id] || 1
      const placed = S.placed.find((pl) => pl.item_id === it.id)
      const ok = placed && placed.bin_id === sc.correct[it.id]
      num += ok ? w : 0
      den += w
      if (!ok && sc.feedback && sc.feedback[it.id]) fb.push(sc.feedback[it.id])
    }
    const s = den ? num / den : 0
    endLevel(finish([{ id: 'accuracy', label: 'Items in the right place', s, w: 1 }], fb.slice(0, 3)))
  }

  function applyConverse(a, params) {
    const turn = level.params.turns[S.turn]
    const n = steps(params)
    if (a === 'key_up') S.sel = Math.max(0, S.sel - n)
    if (a === 'key_down') S.sel = Math.min(turn.options.length - 1, S.sel + n)
    let chosen = null
    if (a === 'interact') chosen = turn.options[S.sel]
    if (a === 'mouse_click' && params.target_id && params.target_id.startsWith('choice:')) chosen = turn.options.find((o) => o.id === params.target_id.slice(7))
    if (!chosen) return
    const rule = level.scoring.turns[turn.id][chosen.id]
    S.history.push({ turn_id: turn.id, option_id: chosen.id })
    S.points.push({ turn, rule })
    S.messages.push({ speaker: 'npc', npc_id: level.params.npc_id, text: chosen.reply, t_ms: S.t })
    emit({ type: 'dialogue', t_ms: S.t, text: chosen.reply })
    S.turn++
    S.sel = 0
    if (rule.critical || S.turn >= level.params.turns.length) {
      const terms = level.params.turns.map((t) => {
        const got = S.points.find((pt) => pt.turn.id === t.id)
        return { id: t.id, label: t.npc_line.slice(0, 40), s: got ? got.rule.points : 0, w: 1 }
      })
      const fb = S.points.filter((pt) => pt.rule.points < 0.8).map((pt) => pt.rule.feedback).slice(0, 3)
      const res = finish(terms, fb)
      if (rule.critical) { res.score = Math.min(res.score, level.scoring.pass_threshold - 1); res.passed = false }
      endLevel(res)
    }
  }

  function applyDeliver(a, params) {
    const p = level.params
    const D = { key_up: [0, -1], key_down: [0, 1], key_left: [-1, 0], key_right: [1, 0] }
    if (D[a]) {
      const b = blocked()
      S.facing = a.slice(4)
      for (let i = 0; i < steps(params); i++) {
        const nx = S.avatar[0] + D[a][0]
        const ny = S.avatar[1] + D[a][1]
        if (nx < 0 || ny < 0 || nx >= world.map.cols || ny >= world.map.rows || b.has(nx + ',' + ny)) break
        S.avatar = [nx, ny]
      }
      return
    }
    if (a === 'interact' || a === 'mouse_click') {
      const t = targets().find((x) => x.id === params.target_id)
      if (!t) throw new Error('nothing to interact with')
      const foot = []
      for (let x = t.x / T; x < (t.x + t.w) / T; x++) for (let y = t.y / T; y < (t.y + t.h) / T; y++) foot.push([x, y])
      if (!foot.some(([x, y]) => Math.abs(x - S.avatar[0]) + Math.abs(y - S.avatar[1]) === 1)) throw new Error('not next to ' + t.label)
      const pick = p.orders.find((o) => (o.from === t.id || t.id === `spot:${o.id}`) && S.status[o.id] === 'waiting')
      const carried = S.carrying.map((id) => p.orders.find((o) => o.id === id))
      const give = carried.find((o) => o.to === t.id) || (carried.length && !pick ? carried[0] : null)
      if (give) {
        S.carrying = S.carrying.filter((id) => id !== give.id)
        S.status[give.id] = give.to === t.id ? 'delivered' : 'wrong'
        emit({ type: 'handover', t_ms: S.t, order_id: give.id })
      } else if (pick && S.carrying.length < p.capacity) {
        S.carrying.push(pick.id)
        S.status[pick.id] = 'carrying'
        emit({ type: 'pickup', t_ms: S.t, order_id: pick.id })
      } else throw new Error('nothing to do here')
      if (Object.values(S.status).every((s) => s === 'delivered' || s === 'wrong')) scoreDeliver()
    }
  }

  function scoreDeliver() {
    const sc = level.scoring
    const vals = Object.values(S.status)
    const acc = vals.filter((s) => s === 'delivered').length / vals.length
    const lim = level.time_limit_ms
    const time = S.t <= level.params.par_ms ? 1 : Math.max(0, 1 - (S.t - level.params.par_ms) / (lim - level.params.par_ms))
    const fb = []
    if (vals.includes('wrong')) fb.push(sc.feedback.wrong_target)
    if (time < 1) fb.push(sc.feedback.late)
    if (vals.some((s) => s === 'waiting' || s === 'carrying')) fb.push(sc.feedback.missed)
    endLevel(finish([{ id: 'accuracy', label: 'Right place', s: acc, w: sc.weights.accuracy }, { id: 'time', label: 'Speed', s: time, w: sc.weights.time }], fb))
  }

  async function act(action) {
    S.events = []
    const a = action && action.action
    const params = (action && action.params) || {}
    try {
      if (!listActions().some((x) => x.action === a)) throw new Error(`'${a}' is not available now`)
      if (S.phase === 'result') return { ok: true, observation: observe(), done: true, score: S.last_result.score, events: [] }
      const cost = a === 'wait' ? params.ms || 0 : a === 'mouse_drag' ? params.duration_ms ?? 200
        : a.startsWith('key_') ? (params.hold_ms > 0 ? params.hold_ms : 100) : COST[a] || 0
      if (!(level.mechanic === 'timing' && a === 'key_up')) S.t += cost
      ;({ mix: applyMix, timing: applyTiming, sort: applySort, converse: applyConverse, deliver: applyDeliver })[level.mechanic](a, params)
      if (!S.done && level.time_limit_ms && S.t >= level.time_limit_ms) {
        if (level.mechanic === 'deliver') scoreDeliver()
        else if (level.mechanic === 'sort') scoreSort()
        else if (level.mechanic === 'mix') submitMix()
        else endLevel({ score: 0, passed: false, feedback: ['Time ran out.'], breakdown: {} })
      }
      render()
      return { ok: true, observation: observe(), done: S.done, score: S.last_result ? S.last_result.score : null, events: S.events }
    } catch (err) {
      emit({ type: 'error', t_ms: S.t, message: String(err.message || err) })
      return { ok: false, error: String(err.message || err), observation: observe(), done: S.done, score: null, events: S.events }
    }
  }

  function render() {
    document.getElementById('state').textContent = JSON.stringify({ level: level.id, phase: S.phase, t: S.t, state: mechanicState(), result: S.last_result }, null, 1)
  }

  fetch(`/api/world?slug=${encodeURIComponent(q.get('slug') || '')}`)
    .then((r) => r.json())
    .then((w) => {
      world = w
      reset(q.get('level') || w.levels[0].id)
      render()
      window.__replaceme = {
        listActions,
        observe,
        act,
        onEvent: (cb) => { listeners.push(cb); return () => listeners.splice(listeners.indexOf(cb), 1) },
        resetLevel: async (id) => { const o = reset(id); render(); return o },
      }
    })
})()
