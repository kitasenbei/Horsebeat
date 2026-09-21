import { useState, type RefObject } from 'react'
import Box from '@mui/material/Box'
import { useTheme } from '@mui/material/styles'
import { drawSectionBlocks, sectionSignature } from '../draw'
import { useCanvas } from '../useCanvas'
import { sectionSpans, type Section } from '../timing'
import { clampRange, type Range } from '../range'

type SectionBlocksProps = {
  sections: Section[]
  duration: number
  range: Range
  position: number
  positionRef: RefObject<number>
  playing: boolean
  onRangeChange: (range: Range) => void
  onSeek: (position: number) => void
}

export const BLOCK_HEIGHT = 18
const LIVE_COLOR = '#e07c0a'

export default function SectionBlocks({
  sections,
  duration,
  range,
  position,
  positionRef,
  playing,
  onRangeChange,
  onSeek,
}: SectionBlocksProps) {
  const [hovered, setHovered] = useState<string | null>(null)
  const theme = useTheme()

  const canvasRef = useCanvas((context, width, height) => {
    drawSectionBlocks(
      context,
      sections,
      duration,
      positionRef.current,
      width,
      height,
      {
        idle: theme.palette.info.main,
        alt: theme.palette.info.dark,
        live: LIVE_COLOR,
        hover: theme.palette.info.light,
        text: theme.palette.common.white,
      },
      hovered,
      `600 10px ${theme.typography.fontFamily}`,
      range,
    )
  }, playing, `${duration}|${hovered}|${position}|${range.start}|${range.end}|${sectionSignature(sections)}`)

  const spanAt = (clientX: number) => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const bounds = canvas.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (clientX - bounds.left) / bounds.width))
    const at = range.start + ratio * (range.end - range.start)
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
        if (!item) return

        // the window keeps the size it had and travels to the section, so the
        // scale you were reading at does not change under you
        const span = range.end - range.start
        onRangeChange(clampRange({ start: item.start, end: item.start + span }))
        onSeek(item.start)
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
