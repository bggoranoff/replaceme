import { useEffect, useRef, useState } from 'react'

const HAIR = '#2b2233'
const SKIN = '#f3d3bf'
const SHADE = '#e3bba4'
const BROW = '#4a3640'
const IRIS = '#9b6bff'

// Pixel portrait whose violet eyes follow the cursor and almost never blink.
export function Face() {
  const ref = useRef<HTMLDivElement>(null)
  const [look, setLook] = useState({ x: 0, y: 0 })
  const [blink, setBlink] = useState(false)

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const box = ref.current?.getBoundingClientRect()
      if (!box) return
      const dx = e.clientX - (box.left + box.width / 2)
      const dy = e.clientY - (box.top + box.height * 0.45)
      setLook({ x: Math.max(-1, Math.min(1, Math.round(dx / 140))), y: dy > 40 ? 1 : 0 })
    }
    window.addEventListener('pointermove', onMove)
    return () => window.removeEventListener('pointermove', onMove)
  }, [])

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const schedule = () => {
      timer = setTimeout(() => {
        setBlink(true)
        timer = setTimeout(() => {
          setBlink(false)
          schedule()
        }, 140)
      }, 6000 + Math.random() * 6000)
    }
    schedule()
    return () => clearTimeout(timer)
  }, [])

  const eye = (x: number) =>
    blink ? (
      <rect x={x} y={16} width={4} height={1} fill={BROW} />
    ) : (
      <g>
        <rect x={x} y={14} width={4} height={3} fill="#fff" />
        <g filter="url(#glow)">
          <rect x={x + 1 + look.x} y={14 + look.y} width={2} height={2} fill={IRIS} />
        </g>
        <rect x={x + 1 + look.x + (look.x < 0 ? 0 : 1)} y={14 + look.y} width={1} height={1} fill="#e9dcff" />
      </g>
    )

  return (
    <div className="face" ref={ref} aria-hidden>
      <svg viewBox="0 0 32 32" shapeRendering="crispEdges">
        <defs>
          <filter id="glow" x="-200%" y="-200%" width="500%" height="500%">
            <feGaussianBlur stdDeviation="0.9" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <rect x={8} y={3} width={16} height={3} fill={HAIR} />
        <rect x={6} y={5} width={20} height={4} fill={HAIR} />
        <rect x={5} y={8} width={4} height={20} fill={HAIR} />
        <rect x={23} y={8} width={4} height={20} fill={HAIR} />
        <rect x={7} y={28} width={18} height={4} fill={HAIR} />
        <rect x={13} y={25} width={6} height={4} fill={SHADE} />
        <rect x={9} y={8} width={14} height={15} fill={SKIN} />
        <rect x={10} y={23} width={12} height={2} fill={SKIN} />
        <rect x={12} y={25} width={8} height={1} fill={SKIN} />
        <rect x={15} y={6} width={2} height={3} fill={HAIR} />
        <rect x={9} y={8} width={6} height={2} fill={HAIR} />
        <rect x={17} y={8} width={6} height={2} fill={HAIR} />
        <rect x={10} y={12} width={4} height={1} fill={BROW} />
        <rect x={18} y={12} width={4} height={1} fill={BROW} />
        {eye(10)}
        {eye(18)}
        <rect x={16} y={18} width={1} height={2} fill={SHADE} />
        <rect x={10} y={19} width={2} height={1} fill="#f2b5b5" />
        <rect x={20} y={19} width={2} height={1} fill="#f2b5b5" />
        <rect x={14} y={21} width={4} height={1} fill="#c9877f" />
      </svg>
    </div>
  )
}
