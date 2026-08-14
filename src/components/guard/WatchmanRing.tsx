import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

export interface RingPoint {
  id: string
  name: string
  scanned: boolean
}

interface WatchmanRingProps {
  done: number
  total: number
  status: 'done' | 'active' | 'waiting' | 'missed'
  points: RingPoint[]
  onPointClick?: (pointId: string) => void
  size?: number
  label?: string
  tone?: 'light' | 'dark'
}

const TAU = Math.PI * 2

export default function WatchmanRing({
  done,
  total,
  status,
  points,
  onPointClick,
  size = 140,
  label,
  tone = 'light',
}: WatchmanRingProps) {
  const pct = total ? Math.round((done / total) * 100) : 0
  const [display, setDisplay] = useState(0)

  useEffect(() => {
    let raf = 0
    const from = display
    const to = pct
    const start = performance.now()
    const dur = 600
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / dur)
      const eased = 1 - Math.pow(1 - k, 3)
      setDisplay(Math.round(from + (to - from) * eased))
      if (k < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pct])

  const stroke = Math.max(8, size * 0.075)
  const r = (size - stroke) / 2 - 8
  const c = TAU * r
  const arc = (pct / 100) * c

  const segRadius = r + stroke / 2 + 5
  const segR = Math.max(4, size * 0.035)

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={status === 'waiting' ? '#e2e8f0' : status === 'missed' ? '#fecaca' : '#dbeafe'}
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={
            status === 'done'
              ? '#10b981'
              : status === 'missed'
                ? '#ef4444'
                : status === 'active'
                  ? 'url(#wg-grad)'
                  : '#cbd5e1'
          }
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${arc} ${c - arc}`}
          className="transition-all duration-700 ease-out"
        />
        <defs>
          <linearGradient id="wg-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#0f62fe" />
            <stop offset="100%" stopColor="#0052d4" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0">
        {points.map((p, i) => {
          const ang = (i / Math.max(points.length, 1)) * TAU - Math.PI / 2
          const x = size / 2 + Math.cos(ang) * segRadius
          const y = size / 2 + Math.sin(ang) * segRadius
          return (
            <button
              key={p.id}
              title={p.name}
              onClick={() => {
                if (!p.scanned && onPointClick) onPointClick(p.id)
              }}
              className={cn(
                'absolute -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white transition-transform active:scale-125',
                p.scanned
                  ? 'bg-emerald-500 shadow-sm shadow-emerald-500/40'
                  : status === 'missed'
                    ? 'bg-red-500 shadow-sm shadow-red-500/40'
                    : status === 'active' && onPointClick
                      ? 'cursor-pointer bg-slate-400 hover:scale-125 hover:bg-brand-blue'
                      : 'bg-slate-400',
              )}
              style={{ left: x, top: y, width: segR * 2, height: segR * 2 }}
            />
          )
        })}
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className={cn(
            'font-extrabold leading-none tabular-nums',
            status === 'done'
              ? tone === 'dark'
                ? 'text-emerald-300'
                : 'text-emerald-600'
              : status === 'missed'
                ? tone === 'dark'
                  ? 'text-red-300'
                  : 'text-red-600'
                : tone === 'dark'
                  ? 'text-white'
                  : 'text-slate-900',
          )}
          style={{ fontSize: size * 0.19 }}
        >
          {display}%
        </span>
        <span
          className={cn(
            'mt-1 text-[10px] font-semibold',
            tone === 'dark' ? 'text-blue-100' : 'text-slate-500',
          )}
        >
          {label ?? `${done}/${total} titik`}
        </span>
      </div>
    </div>
  )
}