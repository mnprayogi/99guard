import { useEffect, useRef } from 'react'

interface ConnectedDotsProps {
  className?: string
  color?: string
  linkColor?: string
  density?: number
  speed?: number
}

export default function ConnectedDots({
  className,
  color = 'rgba(255,255,255,0.55)',
  linkColor = 'rgba(255,255,255,0.18)',
  density = 0.00009,
  speed = 0.35,
}: ConnectedDotsProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const cvs = canvas
    const c2d = ctx
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const LINK_DIST = 130
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    let raf = 0
    let w = 0
    let h = 0
    let particles: { x: number; y: number; vx: number; vy: number }[] = []

    function resize(cvs: HTMLCanvasElement, c2d: CanvasRenderingContext2D) {
      const rect = cvs.parentElement?.getBoundingClientRect()
      w = rect?.width ?? cvs.clientWidth
      h = rect?.height ?? cvs.clientHeight
      cvs.width = w * dpr
      cvs.height = h * dpr
      c2d.setTransform(dpr, 0, 0, dpr, 0, 0)
      const count = Math.min(Math.floor(w * h * density), 70)
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * speed,
        vy: (Math.random() - 0.5) * speed,
      }))
    }

    function step(c2d: CanvasRenderingContext2D) {
      c2d.clearRect(0, 0, w, h)

      for (const p of particles) {
        p.x += p.vx
        p.y += p.vy
        if (p.x < 0 || p.x > w) p.vx *= -1
        if (p.y < 0 || p.y > h) p.vy *= -1
      }

      c2d.lineWidth = 1
      for (let i = 0; i < particles.length; i++) {
        const a = particles[i]
        for (let j = i + 1; j < particles.length; j++) {
          const b = particles[j]
          const dx = a.x - b.x
          const dy = a.y - b.y
          const d = Math.hypot(dx, dy)
          if (d < LINK_DIST) {
            c2d.strokeStyle = linkColor
            c2d.globalAlpha = 1 - d / LINK_DIST
            c2d.beginPath()
            c2d.moveTo(a.x, a.y)
            c2d.lineTo(b.x, b.y)
            c2d.stroke()
          }
        }
      }

      c2d.globalAlpha = 1
      c2d.fillStyle = color
      for (const p of particles) {
        c2d.beginPath()
        c2d.arc(p.x, p.y, 1.6, 0, Math.PI * 2)
        c2d.fill()
      }

      raf = requestAnimationFrame(() => step(c2d))
    }

    resize(cvs, c2d)
    if (prefersReduced) {
      step(c2d)
      cancelAnimationFrame(raf)
    } else {
      raf = requestAnimationFrame(() => step(c2d))
    }

    const ro = new ResizeObserver(() => resize(cvs, c2d))
    if (canvas.parentElement) ro.observe(canvas.parentElement)
    const onResize = () => resize(cvs, c2d)
    window.addEventListener('resize', onResize)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      window.removeEventListener('resize', onResize)
    }
  }, [color, linkColor, density, speed])

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />
}