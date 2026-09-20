import { useState } from 'react'
import Box from '@mui/material/Box'
import { useTheme } from '@mui/material/styles'
import { drawSectionBlocks } from '../draw'
import { useCanvas } from '../useCanvas'
import { sectionSpans, type Section } from '../timing'
import { clampRange, type Range } from '../range'

type SectionBlocksProps = {
  sections: Section[]
  duration: number
  onRangeChange: (range: Range) => void
}

export const BLOCK_HEIGHT = 18

export default function SectionBlocks({
  sections,
  duration,
  onRangeChange,
}: SectionBlocksProps) {
  const [hovered, setHovered] = useState<string | null>(null)
  const theme = useTheme()

  const canvasRef = useCanvas((context, width, height) => {
    drawSectionBlocks(
      context,
      sections,
      duration,
      width,
      height,
      theme.palette.info.dark,
      theme.palette.common.white,
      hovered,
      `10px ${theme.typography.fontFamily}`,
    )
  })

  const spanAt = (clientX: number) => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const bounds = canvas.getBoundingClientRect()
    const at = Math.min(1, Math.max(0, (clientX - bounds.left) / bounds.width))
    return sectionSpans(sections, duration).find((item) => at >= item.start && at <= item.end) ?? null
  }

  return (
    <Box
      component="canvas"
      ref={canvasRef}
      onPointerMove={(event) => {
        const item = spanAt(event.clientX)
        const next = item?.section.id ?? null
        setHovered((current) => (current === next ? current : next))
      }}
      onPointerLeave={() => setHovered(null)}
      onClick={(event) => {
        const item = spanAt(event.clientX)
        if (item) onRangeChange(clampRange({ start: item.start, end: item.end }))
      }}
      sx={{
        display: 'block',
        width: '100%',
        height: BLOCK_HEIGHT,
        flex: '0 0 auto',
        cursor: hovered ? 'pointer' : 'default',
      }}
    />
  )
}
