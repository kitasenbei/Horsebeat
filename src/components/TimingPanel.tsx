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
  onClose: () => void
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
      elevation={6}
      sx={{
        position: 'fixed',
        left: spot.left,
        top: spot.top,
        width: PANEL_WIDTH,
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
          bgcolor: 'action.hover',
          cursor: 'move',
          touchAction: 'none',
        }}
      >
        <DragIndicatorIcon fontSize="small" sx={{ color: 'text.disabled' }} />
        <Typography variant="caption" sx={{ flex: 1 }}>
          Tempo sections
        </Typography>
        <IconButton
          size="small"
          aria-label="Close tempo sections"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={onClose}
        >
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>
      <Box sx={{ p: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
        {sections.length === 0 ? (
          <Typography variant="caption" color="text.secondary">
            No sections yet
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
        <Button
          size="small"
          startIcon={<AddIcon />}
          onClick={() =>
            onSectionsChange(
              sortSections([
                ...sections,
                createSection(positionMs, sections[sections.length - 1]?.bpm ?? 120),
              ]),
            )
          }
          sx={{ alignSelf: 'flex-start', textTransform: 'none' }}
        >
          Add at playhead
        </Button>
      </Box>
    </Paper>
  )
}
