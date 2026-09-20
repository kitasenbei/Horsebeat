import { useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Paper from '@mui/material/Paper'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import AddIcon from '@mui/icons-material/Add'
import CloseIcon from '@mui/icons-material/Close'
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined'
import DragIndicatorIcon from '@mui/icons-material/DragIndicator'
import BpmPicker from './BpmPicker'
import { createSection, sortSections, type Section } from '../timing'

type TimingPanelProps = {
  sections: Section[]
  positionMs: number
  onSectionsChange: (sections: Section[]) => void
  onEditingChange: (id: string | null) => void
  onClose?: () => void
  embedded?: boolean
}

type Move = {
  pointerX: number
  pointerY: number
  left: number
  top: number
}

const PANEL_WIDTH = 300

export default function TimingPanel({
  sections,
  positionMs,
  onSectionsChange,
  onEditingChange,
  onClose,
  embedded = false,
}: TimingPanelProps) {
  const moveRef = useRef<Move | null>(null)
  const [spot, setSpot] = useState({ left: 320, top: 96 })

  const update = (id: string, patch: Partial<Section>) => {
    onSectionsChange(
      sortSections(
        sections.map((section) => (section.id === id ? { ...section, ...patch } : section)),
      ),
    )
  }

  const add = (offsetMs: number) => {
    onSectionsChange(
      sortSections([
        ...sections,
        createSection(offsetMs, sections[sections.length - 1]?.bpm ?? 120),
      ]),
    )
  }

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
    setSpot({
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
      elevation={embedded ? 0 : 6}
      sx={
        embedded
          ? {
              width: '100%',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              border: 1,
              borderColor: 'divider',
            }
          : {
              position: 'fixed',
              left: spot.left,
              top: spot.top,
              width: PANEL_WIDTH,
              zIndex: (current) => current.zIndex.modal,
              overflow: 'hidden',
            }
      }
    >
      <Box
        onPointerDown={embedded ? undefined : startMove}
        onPointerMove={embedded ? undefined : movePanel}
        onPointerUp={embedded ? undefined : endMove}
        onPointerCancel={embedded ? undefined : endMove}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          px: 1,
          py: 0.5,
          bgcolor: 'action.hover',
          cursor: embedded ? 'default' : 'move',
          touchAction: 'none',
        }}
      >
        {embedded ? null : <DragIndicatorIcon fontSize="small" sx={{ color: 'text.disabled' }} />}
        <Typography variant="caption" sx={{ flex: 1 }}>
          Tempo sections
        </Typography>
        {onClose ? (
          <IconButton
            size="small"
            aria-label="Close tempo sections"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={onClose}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        ) : null}
      </Box>
      <Box
        sx={{
          p: 1.5,
          display: 'flex',
          flexDirection: 'column',
          gap: 1,
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
        }}
      >
        {sections.length === 0 ? (
          <Typography variant="caption" color="text.secondary">
            No sections yet :(
          </Typography>
        ) : null}
        {sections.map((section) => (
          <Box key={section.id} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <TextField
              size="small"
              type="number"
              label="Offset ms"
              value={Math.round(section.offsetMs)}
              onChange={(event) => update(section.id, { offsetMs: Number(event.target.value) })}
              onFocus={() => onEditingChange(section.id)}
              onBlur={() => onEditingChange(null)}
              sx={{ flex: 1 }}
            />
            <BpmPicker
              value={section.bpm}
              onChange={(bpm) => update(section.id, { bpm })}
              onEditingChange={(editing) => onEditingChange(editing ? section.id : null)}
            />
            <IconButton
              size="small"
              aria-label="Remove section"
              onClick={() =>
                onSectionsChange(sections.filter((current) => current.id !== section.id))
              }
            >
              <DeleteOutlinedIcon fontSize="small" />
            </IconButton>
          </Box>
        ))}
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <Button
            size="small"
            startIcon={<AddIcon />}
            onClick={() => add(0)}
            sx={{ textTransform: 'none' }}
          >
            At start
          </Button>
          <Button
            size="small"
            startIcon={<AddIcon />}
            onClick={() => add(positionMs)}
            sx={{ textTransform: 'none' }}
          >
            At playhead
          </Button>
        </Box>
      </Box>
    </Paper>
  )
}
