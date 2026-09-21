import { useEffect, useRef, type RefObject } from 'react'
import Box from '@mui/material/Box'
import { sectionSpans, type Section } from '../timing'
import mascot from '../assets/mascot.png'

type MascotProps = {
  sections: Section[]
  duration: number
  positionRef: RefObject<number>
  playing: boolean
}

// One stride, thirty-two frames, drawn at the size it is shown so the sheet is
// read a frame at a time and never scaled.
const FRAMES = 32
const WIDTH = 120
const HEIGHT = 96

// The frame the hind hooves reach lowest in, found the same way as the herd's:
// by walking each frame from the bottom up and asking where the back half of
// the horse first has something in it. It bottoms out in the twenty-seventh,
// two frames before the front half does, so that is the frame the beat gets.
const STRIKE = 26

// One stride to the beat, as with the herd, so mascot and herd land together.
const STRIDES_A_BEAT = 1

// How close to the window edge it is allowed to be dragged, so a horse let go
// of in a corner is still there to pick up again.
const EDGE = 8

export default function Mascot({ sections, duration, positionRef, playing }: MascotProps) {
  const horseRef = useRef<HTMLDivElement>(null)
  const spotRef = useRef<{ x: number; y: number } | null>(null)
  const heldRef = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const node = horseRef.current
    if (!node) return

    const settle = () => {
      const most = { x: window.innerWidth - WIDTH - EDGE, y: window.innerHeight - HEIGHT - EDGE }
      const spot = spotRef.current ?? { x: most.x, y: most.y - 56 }
      spot.x = Math.min(most.x, Math.max(EDGE, spot.x))
      spot.y = Math.min(most.y, Math.max(EDGE, spot.y))
      spotRef.current = spot
      node.style.transform = `translate(${spot.x}px, ${spot.y}px)`
    }

    settle()
    window.addEventListener('resize', settle)
    return () => window.removeEventListener('resize', settle)
  }, [])

  useEffect(() => {
    const node = horseRef.current
    if (!node) return

    const spans = sectionSpans(sections, duration)

    const show = (stride: number) => {
      const round = ((stride % 1) + 1) % 1
      const step = (STRIKE + Math.floor(round * FRAMES)) % FRAMES
      node.style.backgroundPositionX = `${-step * WIDTH}px`
    }

    if (!playing || spans.length === 0) {
      show(0)
      return
    }

    let frame = requestAnimationFrame(function tick() {
      const at = positionRef.current
      const span = spans.find((item) => at >= item.start && at <= item.end) ?? spans[0]
      const beats = span.beat > 0 ? (at - span.start) / span.beat : 0

      show(beats * STRIDES_A_BEAT)

      frame = requestAnimationFrame(tick)
    })

    return () => {
      cancelAnimationFrame(frame)
      show(0)
    }
  }, [playing, sections, duration, positionRef])

  return (
    <Box
      ref={horseRef}
      aria-hidden
      onPointerDown={(event) => {
        const node = horseRef.current
        const spot = spotRef.current
        if (!node || !spot) return
        node.setPointerCapture(event.pointerId)
        heldRef.current = { x: event.clientX - spot.x, y: event.clientY - spot.y }
      }}
      onPointerMove={(event) => {
        const node = horseRef.current
        const held = heldRef.current
        if (!node || !held) return
        const x = Math.min(window.innerWidth - WIDTH - EDGE, Math.max(EDGE, event.clientX - held.x))
        const y = Math.min(window.innerHeight - HEIGHT - EDGE, Math.max(EDGE, event.clientY - held.y))
        spotRef.current = { x, y }
        node.style.transform = `translate(${x}px, ${y}px)`
      }}
      onPointerUp={(event) => {
        horseRef.current?.releasePointerCapture(event.pointerId)
        heldRef.current = null
      }}
      sx={{
        position: 'fixed',
        left: 0,
        top: 0,
        zIndex: (theme) => theme.zIndex.tooltip,
        width: WIDTH,
        height: HEIGHT,
        cursor: 'grab',
        touchAction: 'none',
        userSelect: 'none',
        '&:active': { cursor: 'grabbing' },
        backgroundImage: `url(${mascot})`,
        backgroundSize: `${FRAMES * WIDTH}px ${HEIGHT}px`,
        backgroundRepeat: 'no-repeat',
        backgroundPositionX: '0px',
        filter: 'drop-shadow(0 6px 10px rgba(0, 0, 0, 0.22))',
        willChange: 'background-position, transform',
      }}
    />
  )
}
