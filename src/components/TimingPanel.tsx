import { useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Paper from '@mui/material/Paper'
import Chip from '@mui/material/Chip'
import InputBase from '@mui/material/InputBase'
import Typography from '@mui/material/Typography'
import AddIcon from '@mui/icons-material/Add'
import CloseIcon from '@mui/icons-material/Close'
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined'
import DragIndicatorIcon from '@mui/icons-material/DragIndicator'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import Tooltip from '@mui/material/Tooltip'
import BpmPicker from './BpmPicker'
import { createSection, sortSections, type Section } from '../timing'

type TimingPanelProps = {
  sections: Section[]
  positionMs: number
  durationMs: number
  onJump: (fromMs: number, toMs: number) => void
  onSeekMs: (ms: number) => void
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
const CARD_IDLE = '#f2f0f7'

const ACTION_COLOR = '#ece7ff'
const ACTION_HOVER = '#dbd1ff'
const ACTION_INK = '#3a1d92'

const CARD_LIVE = '#e07c0a'
const CARD_LIVE_BORDER = '#ffdfb4'
const LIVE_PILL = '#fff3e2'
const LIVE_PILL_HOVER = '#ffe6c7'
const LIVE_INK = '#8a4b02'

function actionPill(live: boolean) {
  return {
    width: 34,
    height: 34,
    borderRadius: 999,
    bgcolor: live ? LIVE_PILL : ACTION_COLOR,
    color: live ? LIVE_INK : ACTION_INK,
    '&:hover': {
      bgcolor: live ? LIVE_PILL_HOVER : ACTION_HOVER,
      color: live ? LIVE_INK : ACTION_INK,
    },
  }
}

export default function TimingPanel({
  sections,
  positionMs,
  durationMs,
  onJump,
  onSeekMs,
  onSectionsChange,
  onEditingChange,
  onClose,
  embedded = false,
}: TimingPanelProps) {
  const moveRef = useRef<Move | null>(null)
  const [spot, setSpot] = useState({ left: 320, top: 96 })
  const [editingOffset, setEditingOffset] = useState<string | null>(null)

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
        {sections.map((section, index) => {
          const next = sections[index + 1]
          const endMs = next ? next.offsetMs : durationMs
          const active = positionMs >= section.offsetMs && (!next || positionMs < next.offsetMs)

          return (
            <Box
              key={section.id}
              onClick={() => onJump(section.offsetMs, endMs)}
              sx={{
                display: 'flex',
                flexDirection: 'column',
                gap: 1,
                p: 1,
                borderRadius: 2,
                border: 1,
                borderColor: active ? CARD_LIVE_BORDER : CARD_IDLE,
                bgcolor: active ? CARD_LIVE : 'info.main',
                color: active ? 'info.contrastText' : 'text.primary',
                cursor: 'pointer',
                '&:hover': { borderColor: 'info.light' },
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'stretch', gap: 1 }}>
                <Box
                  sx={{
                    flex: 1,
                    minWidth: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    gap: 1,
                    alignItems: 'flex-start',
                  }}
                >
                  <Box onClick={(event) => event.stopPropagation()}>
                    <BpmPicker
                      value={section.bpm}
                      active={active}
                      onChange={(bpm) => update(section.id, { bpm })}
                      onEditingChange={(editing) => onEditingChange(editing ? section.id : null)}
                    />
                  </Box>

                  <Box
                    onClick={(event) => event.stopPropagation()}
                    sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}
                  >
                    {editingOffset === section.id ? (
                      <InputBase
                        autoFocus
                        value={Math.round(section.offsetMs)}
                        inputProps={{
                          inputMode: 'numeric',
                          'aria-label': 'Section offset in milliseconds',
                        }}
                        onChange={(event) =>
                          update(section.id, { offsetMs: Number(event.target.value) })
                        }
                        onFocus={() => onEditingChange(section.id)}
                        onBlur={() => {
                          setEditingOffset(null)
                          onEditingChange(null)
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === 'Escape') setEditingOffset(null)
                        }}
                        sx={{
                          width: 72,
                          px: 1,
                          borderRadius: 999,
                          border: 1,
                          bgcolor: 'background.paper',
                          borderColor: active ? CARD_LIVE : ACTION_COLOR,
                          color: active ? LIVE_INK : ACTION_INK,
                          fontSize: (current) => current.typography.caption.fontSize,
                          '& input': { p: 0, textAlign: 'center' },
                        }}
                      />
                    ) : (
                      <Chip
                        size="small"
                        label={`${Math.round(section.offsetMs)} ms`}
                        onClick={() => {
                          setEditingOffset(section.id)
                          onEditingChange(section.id)
                        }}
                        sx={{
                          bgcolor: active ? LIVE_PILL : ACTION_COLOR,
                          color: active ? LIVE_INK : ACTION_INK,
                          fontWeight: 600,
                          '&:hover': { bgcolor: active ? LIVE_PILL_HOVER : ACTION_HOVER },
                        }}
                      />
                    )}
                  </Box>
                </Box>

                <Box
                  onClick={(event) => event.stopPropagation()}
                  sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    gap: 0.5,
                    flex: '0 0 auto',
                  }}
                >
                  <Tooltip title="Play from here">
                    <IconButton
                      size="small"
                      aria-label="Play from section"
                      onClick={() => onSeekMs(section.offsetMs)}
                      sx={actionPill(active)}
                    >
                      <PlayArrowIcon sx={{ fontSize: 20 }} />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Remove section">
                    <IconButton
                      size="small"
                      aria-label="Remove section"
                      onClick={() =>
                        onSectionsChange(sections.filter((current) => current.id !== section.id))
                      }
                      sx={actionPill(active)}
                    >
                      <DeleteOutlinedIcon sx={{ fontSize: 20 }} />
                    </IconButton>
                  </Tooltip>
                </Box>
              </Box>

            </Box>
          )
        })}
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
