import { useRef, useState } from 'react'
import Box from '@mui/material/Box'
import { useTheme } from '@mui/material/styles'
import { drawPlayheadHandle, HANDLE_WIDTH, sectionSignature } from '../draw'
import { useCanvas } from '../useCanvas'
import { useRafCallback } from '../useRafCallback'
import { RAIL_HEIGHT } from './PlayheadRail'
import { sortSections, type Section } from '../timing'
import type { Range } from '../range'

type SectionRailProps = {
  sections: Section[]
  range: Range
  duration: number
  onSectionsChange: (sections: Section[]) => void
}

export default function SectionRail({
  sections,
  range,
  duration,
  onSectionsChange,
}: SectionRailProps) {
  const dragRef = useRef<string | null>(null)
  const applySections = useRafCallback(onSectionsChange)
  const [hovered, setHovered] = useState<string | null>(null)
  const theme = useTheme()
  const color = theme.palette.info.main
  const hoverColor = theme.palette.info.light

  const offsetOf = (section: Section) => section.offsetMs / 1000 / duration

  const canvasRef = useCanvas((context, width, height) => {
    if (duration <= 0) return
    for (const section of sections) {
      drawPlayheadHandle(
        context,
        offsetOf(section),
        range,
        width,
        height,
        hovered === section.id ? hoverColor : color,
      )
    }
  }, false, `${range.start}|${range.end}|${duration}|${hovered}|${sectionSignature(sections)}`)

  const positionAt = (clientX: number) => {
    const canvas = canvasRef.current
    if (!canvas) return range.start
    const bounds = canvas.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (clientX - bounds.left) / bounds.width))
    return range.start + ratio * (range.end - range.start)
  }

  const nearest = (at: number) => {
    const canvas = canvasRef.current
    if (!canvas || duration <= 0) return null
    const grab = (HANDLE_WIDTH / canvas.clientWidth) * (range.end - range.start)
    let found: string | null = null
    let best = grab
    for (const section of sections) {
      const distance = Math.abs(offsetOf(section) - at)
      if (distance <= best) {
        best = distance
        found = section.id
      }
    }
    return found
  }

  const begin = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0) return
    const id = nearest(positionAt(event.clientX))
    if (!id) return
    dragRef.current = id
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const id = dragRef.current
    const at = positionAt(event.clientX)

    if (!id) {
      const over = nearest(at)
      setHovered((current) => (current === over ? current : over))
      return
    }

    applySections(
      sortSections(
        sections.map((section) =>
          section.id === id ? { ...section, offsetMs: Math.max(0, at * duration * 1000) } : section,
        ),
      ),
    )
  }

  const end = (event: React.PointerEvent<HTMLCanvasElement>) => {
    dragRef.current = null
    event.currentTarget.releasePointerCapture(event.pointerId)
  }

  return (
    <Box
      component="canvas"
      ref={canvasRef}
      onPointerDown={begin}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      onPointerLeave={() => setHovered(null)}
      sx={{
        display: 'block',
        width: '100%',
        height: RAIL_HEIGHT,
        flex: '0 0 auto',
        touchAction: 'none',
        cursor: hovered ? 'pointer' : 'default',
      }}
    />
  )
}
