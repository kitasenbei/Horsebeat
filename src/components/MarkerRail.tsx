import { useRef, useState } from 'react'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import Paper from '@mui/material/Paper'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined'
import Tooltip from '@mui/material/Tooltip'
import { useTheme } from '@mui/material/styles'
import { drawPlayheadHandle, HANDLE_WIDTH } from '../draw'
import { useCanvas } from '../useCanvas'
import { useRafCallback } from '../useRafCallback'
import { RAIL_HEIGHT } from './PlayheadRail'
import type { Range } from '../range'

type MarkerRailProps = {
  markers: number[]
  range: Range
  enabled: boolean
  focus: { start: number; end: number } | null
  ghost: number | null
  onMarkersChange: (markers: number[]) => void
}

const CLICK_SLOP = 4

export default function MarkerRail({
  markers,
  range,
  enabled,
  focus,
  ghost,
  onMarkersChange,
}: MarkerRailProps) {
  const dragRef = useRef<number | null>(null)
  const downRef = useRef<number | null>(null)
  const applyMarkers = useRafCallback(onMarkersChange)
  const [selected, setSelected] = useState<number | null>(null)
  const [hovered, setHovered] = useState<number | null>(null)
  const theme = useTheme()
  const color = theme.palette.secondary.main
  const hoverColor = theme.palette.secondary.light

  const inFocus = (marker: number) => !focus || (marker >= focus.start && marker <= focus.end)

  const canvasRef = useCanvas((context, width, height) => {
    markers.forEach((marker, index) => {
      if (!inFocus(marker)) return
      const active = selected === index || hovered === index
      context.globalAlpha = active ? 1 : 0.85
      drawPlayheadHandle(
        context,
        marker,
        range,
        width,
        height,
        hovered === index ? hoverColor : color,
      )
    })
    context.globalAlpha = 1

    if (ghost !== null) {
      context.globalAlpha = 0.4
      drawPlayheadHandle(context, ghost, range, width, height, color)
      context.globalAlpha = 1
    }
  })

  const positionAt = (clientX: number) => {
    const canvas = canvasRef.current
    if (!canvas) return range.start
    const bounds = canvas.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (clientX - bounds.left) / bounds.width))
    return range.start + ratio * (range.end - range.start)
  }

  const nearest = (at: number) => {
    const canvas = canvasRef.current
    if (!canvas) return -1
    const grab = (HANDLE_WIDTH / canvas.clientWidth) * (range.end - range.start)
    let found = -1
    let best = grab
    markers.forEach((marker, index) => {
      if (!inFocus(marker)) return
      const distance = Math.abs(marker - at)
      if (distance <= best) {
        best = distance
        found = index
      }
    })
    return found
  }

  const begin = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!enabled) return
    const index = nearest(positionAt(event.clientX))
    if (index < 0) {
      setSelected(null)
      return
    }

    dragRef.current = index
    downRef.current = event.clientX
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const index = dragRef.current
    if (index === null) {
      if (!enabled) return
      const over = nearest(positionAt(event.clientX))
      setHovered((current) => {
        const next = over < 0 ? null : over
        return current === next ? current : next
      })
      return
    }

    const at = positionAt(event.clientX)
    applyMarkers(markers.map((marker, current) => (current === index ? at : marker)))
  }

  const end = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const index = dragRef.current
    const down = downRef.current
    dragRef.current = null
    downRef.current = null
    event.currentTarget.releasePointerCapture(event.pointerId)

    if (index === null || down === null) return
    if (Math.abs(event.clientX - down) <= CLICK_SLOP) {
      setSelected((current) => (current === index ? null : index))
    }
  }

  const span = range.end - range.start
  const marker = selected === null ? null : markers[selected]
  const visible =
    marker !== null && marker !== undefined && marker >= range.start && marker <= range.end

  return (
    <Box sx={{ position: 'relative', flex: '0 0 auto' }}>
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
          touchAction: 'none',
          cursor: hovered === null ? 'default' : 'pointer',
        }}
      />
      {visible ? (
        <Box
          onPointerDown={(event) => {
            event.preventDefault()
            event.stopPropagation()
            setSelected(null)
          }}
          sx={{ position: 'fixed', inset: 0, zIndex: (current) => current.zIndex.modal - 1 }}
        />
      ) : null}
      {visible ? (
        <Paper
          elevation={3}
          sx={{
            position: 'absolute',
            top: '100%',
            left: `${((marker - range.start) / span) * 100}%`,
            transform: 'translateX(-50%)',
            mt: 0.5,
            px: 0.5,
            py: 0.25,
            display: 'flex',
            alignItems: 'center',
            gap: 0.25,
            borderRadius: 999,
            zIndex: (current) => current.zIndex.modal,
          }}
        >
          <Tooltip title="Remove marker">
            <IconButton
              size="small"
              aria-label="Remove marker"
              onClick={() => {
                onMarkersChange(markers.filter((_, current) => current !== selected))
                setSelected(null)
              }}
            >
              <DeleteOutlineIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Paper>
      ) : null}
    </Box>
  )
}
