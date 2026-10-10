// Small pixel-art objects (jars, sacks, parcels...) for minigame items, picked from the item's own words.
// The shape and colour only echo the label; they never hint at where an item belongs.
import { WOOD_DARK, seedOf, shade, type Ctx } from './pixel'

export type ObjectKind = 'jar' | 'bottle' | 'sack' | 'box' | 'parcel' | 'flowers' | 'loaf' | 'part' | 'paper'

const KINDS: [RegExp, ObjectKind][] = [
  [/\b(jar|jars|honey|jam|preserve|pot|tin|can|cream)\b/i, 'jar'],
  [/\b(bottle|oil|liquid|vinegar|wine|chemical|solvent|spray|syrup|sauce|lube|lubricant|fluid|degreaser|cleaner|wax|milk|juice)/i, 'bottle'],
  [/\b(sack|bag|flour|grain|rice|seeds?|beans?|sugar|meal|powder|soil|compost|feed|coffee|salt)\b/i, 'sack'],
  [/\b(flowers?|roses?|tulips?|stems?|bouquets?|blooms?|lil(y|ies)|plants?|herbs?|leaves|leaf|peon(y|ies)|daisy|daisies|daffodils?|narcissus|orchids?|anthuriums?|peas|carnations?|hydrangeas?|sunflowers?|lavender|wreaths?|posy|posies|fresh-cut)\b/i, 'flowers'],
  [/\b(bread|loaf|loaves|rolls?|buns?|cakes?|pastry|pastries|croissants?|baguettes?|boules?|brioche|batards?|sourdough|cookies?|pies?)\b/i, 'loaf'],
  [/\b(bolts?|screws?|nuts?|parts?|chains?|tools?|springs?|gears?|bearings?|cables?|spindles?|cups?|rotors?|pads?|calipers?|hubs?|valves?|pipes?)\b/i, 'part'],
  [/\b(letters?|forms?|documents?|files?|invoices?|records?|cards?|tickets?|receipts?|notes?|reports?|prescriptions?|charts?)\b/i, 'paper'],
  [/\b(box|boxes|kits?|packs?|cartons?|cases?|crates?)\b/i, 'box'],
]

/** Which object an item looks like, from its label and attribute values only. */
export function objectKind(label: string, attrs: Record<string, string> = {}): ObjectKind {
  const words = `${label} ${Object.values(attrs).join(' ')}`
  for (const [re, k] of KINDS) if (re.test(words)) return k
  return 'parcel'
}

const COLOR_WORDS: [RegExp, string][] = [
  [/\b(red|crimson|scarlet|cherry)\b/i, '#d9534a'],
  [/\b(orange|copper)\b/i, '#e58a3a'],
  [/\b(amber|golden|gold|honey)\b/i, '#e2a33a'],
  [/\b(yellow|lemon)\b/i, '#f0cf4a'],
  [/\b(green|olive|mint|herb)\b/i, '#6faa4a'],
  [/\b(blue|navy|teal)\b/i, '#5e8fc9'],
  [/\b(purple|violet|lavender|plum)\b/i, '#9a6ac2'],
  [/\b(pink|rose|blush)\b/i, '#ee9ab4'],
  [/\b(white|light|pale|clear|cream|ivory)\b/i, '#f4ead2'],
  [/\b(dark|black|rye|espresso)\b/i, '#5a3a24'],
  [/\b(brown|whole|wholemeal|buckwheat|bronze)\b/i, '#9a6a3f'],
  [/\b(grey|gray|silver|steel|titanium|aluminium|aluminum)\b/i, '#a8b0ba'],
]
const FALLBACK = ['#d9734e', '#5e8fc9', '#8cbf5a', '#b56fc2', '#e2b84a', '#4fa59a', '#c98e4f']

/** Colour that echoes the item's own words (e.g. "dark", "amber"), else a stable colour from its label. */
export function objectTint(label: string, attrs: Record<string, string> = {}): string {
  const words = `${Object.values(attrs).join(' ')} ${label}`
  for (const [re, c] of COLOR_WORDS) if (re.test(words)) return c
  return FALLBACK[seedOf(label) % FALLBACK.length]
}

/** Draws an object standing with its bottom centre at (cx, by), 16 px tall at s = 1. */
export function drawObject(ctx: Ctx, kind: ObjectKind, cx: number, by: number, s: number, tint: string) {
  ctx.save()
  ctx.translate(cx - 8 * s, by - 16 * s)
  ctx.scale(s, s)
  const r = (c: string, x: number, y: number, w: number, h: number) => {
    ctx.fillStyle = c
    ctx.fillRect(x, y, w, h)
  }
  const dark = shade(tint, -0.3)
  const lite = shade(tint, 0.35)
  r('rgba(40,24,10,0.22)', 2, 15, 12, 1.5)
  switch (kind) {
    case 'jar':
      r(WOOD_DARK, 4, 1, 8, 4)
      r('#c98e4f', 5, 2, 6, 2)
      r(WOOD_DARK, 2, 5, 12, 11)
      r(tint, 3, 6, 10, 9)
      r(lite, 4, 7, 2, 6)
      r('#fbecc8', 4, 9, 8, 4)
      r(dark, 5, 10, 6, 1)
      break
    case 'bottle':
      r(WOOD_DARK, 6, 0, 4, 2)
      r(WOOD_DARK, 6.5, 2, 3, 3)
      r(dark, 7, 2, 2, 3)
      r(WOOD_DARK, 4, 5, 8, 11)
      r(tint, 5, 6, 6, 9)
      r(lite, 5, 6, 1.5, 8)
      r('#fbecc8', 5, 9, 6, 4)
      break
    case 'sack':
      // slumped burlap sack tied at the neck
      r(WOOD_DARK, 6, 0, 4, 1)
      r(WOOD_DARK, 5, 1, 6, 3)
      r('#d9b98a', 6, 1, 4, 2)
      r('#8a5a32', 5, 4, 6, 1)
      r(WOOD_DARK, 4, 5, 8, 1)
      r(WOOD_DARK, 2, 6, 12, 1)
      r(WOOD_DARK, 1, 7, 14, 9)
      r('#d9b98a', 3, 6, 10, 1)
      r('#d9b98a', 2, 7, 12, 8)
      r('#e8cfa6', 3, 7, 3, 6)
      r(shade('#d9b98a', -0.12), 11, 8, 2, 7)
      r(tint, 5, 9, 6, 4)
      r(shade(tint, 0.3), 5, 9, 6, 1)
      r(shade('#d9b98a', -0.2), 2, 14, 12, 1)
      break
    case 'flowers':
      r('#3f7f3a', 7, 5, 1, 7)
      r('#3f7f3a', 5, 6, 1, 6)
      r('#3f7f3a', 10, 6, 1, 6)
      r(WOOD_DARK, 4, 10, 8, 6)
      r('#f4ead2', 5, 10, 6, 5)
      r(shade('#f4ead2', -0.1), 5, 13, 6, 1)
      for (const [x, y] of [[3, 2], [7, 0], [10, 2], [5, 4], [9, 4]]) {
        r(dark, x, y + 1, 3, 3)
        r(tint, x, y, 3, 3)
        r('#fff0a8', x + 1, y + 1, 1, 1)
      }
      break
    case 'loaf':
      r(WOOD_DARK, 1, 7, 14, 9)
      r(WOOD_DARK, 3, 6, 10, 1)
      r('#c98a3e', 2, 8, 12, 7)
      r('#e0a85a', 3, 7, 10, 3)
      r('#f2c98a', 4, 8, 3, 1)
      r('#8a5a24', 5, 10, 2, 1)
      r('#8a5a24', 8, 9, 2, 1)
      r('#8a5a24', 11, 10, 1, 1)
      break
    case 'part': {
      const metal = /^#(a8b0ba|f4ead2)$/.test(tint) ? '#a8b0ba' : shade(tint, 0.1)
      r(WOOD_DARK, 3, 3, 10, 12)
      r(WOOD_DARK, 1, 6, 14, 6)
      r(WOOD_DARK, 6, 1, 4, 14)
      r(metal, 4, 4, 8, 10)
      r(metal, 2, 7, 12, 4)
      r(metal, 7, 2, 2, 12)
      r(shade(metal, 0.35), 4, 4, 3, 2)
      r(WOOD_DARK, 6.5, 7.5, 3, 3)
      r('#fbecc8', 7, 8, 2, 2)
      break
    }
    case 'paper':
      r(WOOD_DARK, 3, 2, 10, 14)
      r('#fffaf0', 4, 3, 8, 12)
      r(shade('#fffaf0', -0.12), 10, 3, 2, 2)
      for (let y = 6; y < 14; y += 2) r(y === 6 ? tint : '#c9b393', 5, y, y === 6 ? 4 : 6, 1)
      break
    case 'box':
      r(WOOD_DARK, 1, 5, 14, 11)
      r('#d9a86a', 2, 6, 12, 9)
      r('#c08a4e', 2, 6, 12, 2)
      r(shade('#d9a86a', 0.2), 3, 8, 2, 6)
      r(tint, 6, 6, 4, 9)
      r(dark, 6, 14, 4, 1)
      break
    default:
      r(WOOD_DARK, 1, 5, 14, 11)
      r('#d9a86a', 2, 6, 12, 9)
      r(shade('#d9a86a', 0.2), 3, 7, 2, 7)
      r(tint, 7, 6, 2, 9)
      r(tint, 2, 9, 12, 2)
      r(dark, 5, 3, 3, 3)
      r(dark, 8, 3, 3, 3)
      r(tint, 6, 3, 1.5, 2)
      r(tint, 8.5, 3, 1.5, 2)
      r(lite, 7, 4, 2, 2)
  }
  ctx.restore()
}

const RIBBONS = ['#e8574a', '#5e8fc9', '#8cc265', '#c47ae0', '#e2b84a', '#4fa59a', '#f08a5d', '#6c7fd8']

/** Ribbon colour of the i-th order, so one order looks the same everywhere. */
export function ribbonColor(i: number): string {
  return RIBBONS[Math.max(0, i) % RIBBONS.length]
}

/** A wrapped parcel, top-left at (x, y), 10 x 8 at s = 1. */
export function drawParcel(ctx: Ctx, x: number, y: number, ribbon: string, s = 1) {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(s, s)
  const r = (c: string, a: number, b: number, w: number, h: number) => {
    ctx.fillStyle = c
    ctx.fillRect(a, b, w, h)
  }
  r(WOOD_DARK, 0, 1, 10, 7)
  r('#d9a86a', 1, 2, 8, 5)
  r('#e8c08a', 1, 2, 8, 1)
  r(ribbon, 4, 1, 2, 7)
  r(ribbon, 1, 4, 8, 1)
  r(shade(ribbon, -0.3), 3, 0, 2, 2)
  r(shade(ribbon, -0.3), 5, 0, 2, 2)
  ctx.restore()
}
