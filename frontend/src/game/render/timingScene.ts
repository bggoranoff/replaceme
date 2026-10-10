// Which physical action a timing phase looks like (heat, pour, dip, bake, puff...), from the phase's
// unit and label, never the job. Shared by the timing mechanic (sound) and its panel (scene).
import type { TimingPhase } from '../types'

export type Scene = 'heat' | 'oven' | 'pour' | 'height' | 'dip' | 'steep' | 'rise' | 'puff' | 'clock' | 'dial'

const LENGTH_UNIT = /^(mm|cm|m|in|inch|inches|ft|feet|")$/
const VOLUME_UNIT = /^(ml|l|cl|dl|oz|fl ?oz|cups?|tsp|tbsp|g|kg|shots?)$/
export const TIME_UNIT = /^(s|sec|secs|seconds?|ms|min|mins|minutes?|h|hr|hrs|hours?)$/

const OVEN_WORDS = /\b(oven|bake|baking|roast|toast|hearth|crust|loaf|bread|kiln)/

/**
 * Which physical action a phase looks like, from its unit and label (never the job). `context` is the
 * level's own title and station name, used only to tell an oven from a pot.
 */
export function sceneOf(p: TimingPhase, context = ''): Scene {
  const u = p.unit.toLowerCase().trim()
  const l = `${p.label} ${p.id}`.toLowerCase().replace(/_/g, ' ')
  if (/°|℃|℉|deg|kelvin/.test(u) || /\b(heat|temp|warm|steam|boil|cook|bake|roast|melt|toast|simmer|fry)/.test(l)) {
    return OVEN_WORDS.test(l) || OVEN_WORDS.test(context.toLowerCase()) ? 'oven' : 'heat'
  }
  if (/\b(smoke|puff|spray|mist|spritz)/.test(`${u} ${l}`)) return 'puff'
  if (/\b(dip|immers|dunk|submerg|soak|rinse|plunge|bath)/.test(l)) return 'dip'
  if (LENGTH_UNIT.test(u) || /\b(height|length|depth|distance|cut|trim|lift)/.test(l)) return 'height'
  if (/\b(steep|brew|infus|extract|marinat|bloom)/.test(l)) return 'steep'
  if (/\b(rise|proof|dough|grow|ferment|knead)/.test(l)) return 'rise'
  if (VOLUME_UNIT.test(u) || /full|fill/.test(`${u} ${l}`) || /\b(pour|water|milk|drop|top up|portion|dose|add)/.test(l)) return 'pour'
  if (TIME_UNIT.test(u) || /\b(time|duration|wait|timer)/.test(l)) return 'clock'
  return 'dial'
}
