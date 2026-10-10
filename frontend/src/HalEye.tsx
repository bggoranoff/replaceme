import { useEffect, useRef, useState } from 'react'

// HAL 9000-style lens whose glowing core follows the cursor.
export function HalEye() {
  const ref = useRef<HTMLDivElement>(null)
  const [look, setLook] = useState({ x: 0, y: 0 })

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const box = ref.current?.getBoundingClientRect()
      if (!box) return
      const dx = e.clientX - (box.left + box.width / 2)
      const dy = e.clientY - (box.top + box.height / 2)
      const dist = Math.hypot(dx, dy) || 1
      const reach = Math.min(1, dist / 300) * 12
      setLook({ x: (dx / dist) * reach, y: (dy / dist) * reach })
    }
    window.addEventListener('pointermove', onMove)
    return () => window.removeEventListener('pointermove', onMove)
  }, [])

  return (
    <div className="hal" ref={ref} aria-hidden>
      <svg viewBox="0 0 100 100">
        <defs>
          <linearGradient id="hal-rim" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#e8eef2" />
            <stop offset="0.5" stopColor="#7d8a93" />
            <stop offset="1" stopColor="#d5dde2" />
          </linearGradient>
          <radialGradient id="hal-glow">
            <stop offset="0" stopColor="#ff3b1f" />
            <stop offset="0.35" stopColor="#b3170c" />
            <stop offset="0.7" stopColor="#4a0603" />
            <stop offset="1" stopColor="#050203" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="hal-core">
            <stop offset="0" stopColor="#fff6c2" />
            <stop offset="0.6" stopColor="#ffd23f" />
            <stop offset="1" stopColor="#ff9a1f" />
          </radialGradient>
          <clipPath id="hal-lens">
            <circle cx="50" cy="50" r="40" />
          </clipPath>
        </defs>
        <circle cx="50" cy="50" r="49" fill="url(#hal-rim)" />
        <circle cx="50" cy="50" r="44" fill="#16181b" />
        <circle cx="50" cy="50" r="40" fill="#050203" />
        <g clipPath="url(#hal-lens)">
          <g className="hal-iris" style={{ transform: `translate(${look.x}px, ${look.y}px)` }}>
            <circle cx="50" cy="50" r="34" fill="url(#hal-glow)" />
            <circle cx="50" cy="50" r="5" fill="url(#hal-core)" />
          </g>
          <path d="M28 30 Q50 16 72 30" stroke="#9fd0d8" strokeWidth="3" fill="none" opacity="0.35" strokeLinecap="round" />
          <path d="M38 40 Q50 34 62 40" stroke="#c9e6ea" strokeWidth="1.5" fill="none" opacity="0.4" strokeLinecap="round" />
        </g>
      </svg>
    </div>
  )
}
