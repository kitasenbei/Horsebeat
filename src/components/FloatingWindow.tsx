import { useRef, useState, type ReactNode } from 'react'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import CloseIcon from '@mui/icons-material/Close'
import DragIndicatorIcon from '@mui/icons-material/DragIndicator'
import { useRafCallback } from '../useRafCallback'
import { tick } from '../trace'

type FloatingWindowProps = {
  title: string
  width: number
  left?: number
  top?: number
  onClose: () => void
  children: ReactNode
}

type Move = {
  pointerX: number
  pointerY: number
  left: number
  top: number
}

// A panel the window keeps out of the layout: the page under it stays the size
// it was, and the drag runs off a ref so a pointer move costs one frame rather
// than one render.
export default function FloatingWindow({
  title,
  width,
  left = 32,
  top = 96,
  onClose,
  children,
}: FloatingWindowProps) {
  const moveRef = useRef<Move | null>(null)
  const [spot, setSpot] = useState({ left, top })
  const applySpot = useRafCallback(setSpot)

  const startMove = (event: React.PointerEvent<HTMLDivElement>) => {
    moveRef.current = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      left: spot.left,
      top: spot.top,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const movePanel = (event: React.PointerEvent<HTMLDivElement>) => {
    const move = moveRef.current
    if (!move) return
    tick('drag window move')
    applySpot({
      left: Math.max(0, move.left + (event.clientX - move.pointerX)),
      top: Math.max(0, move.top + (event.clientY - move.pointerY)),
    })
  }

  const endMove = (event: React.PointerEvent<HTMLDivElement>) => {
    moveRef.current = null
    event.currentTarget.releasePointerCapture(event.pointerId)
  }

  return (
    <Paper
      sx={{
        position: 'fixed',
        left: spot.left,
        top: spot.top,
        width,
        zIndex: (current) => current.zIndex.modal,
        overflow: 'hidden',
      }}
    >
      <Box
        onPointerDown={startMove}
        onPointerMove={movePanel}
        onPointerUp={endMove}
        onPointerCancel={endMove}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          px: 1,
          py: 0.5,
          bgcolor: 'background.default',
          borderBottom: 1,
          borderColor: 'divider',
          cursor: 'move',
          touchAction: 'none',
        }}
      >
        <DragIndicatorIcon fontSize="small" sx={{ color: 'text.disabled' }} />
        <Typography
          variant="caption"
          sx={{
            flex: 1,
            fontSize: 11,
            fontWeight: 600,
            color: 'text.secondary',
            userSelect: 'none',
          }}
        >
          {title}
        </Typography>
        <IconButton
          size="small"
          aria-label={`Close ${title.toLowerCase()}`}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={onClose}
        >
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>
      {children}
    </Paper>
  )
}
