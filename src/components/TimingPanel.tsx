import { useEffect, useRef, useState, type RefObject } from 'react'
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
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep'
import CheckIcon from '@mui/icons-material/Check'
import { writeTimingPoints } from '../osu'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import BpmPicker from './BpmPicker'
import { createSection, sortSections, type Section } from '../timing'
import { tick } from '../trace'
import { useLivePosition } from '../useLivePosition'

type TimingPanelProps = {
  sections: Section[]
  position: number
  positionRef: RefObject<number>
  playing: boolean
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
const CARD_HEIGHT = 74
const CARD_STEP = CARD_HEIGHT + 8
const OVERSCAN = 3
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
  position,
  positionRef,
  playing,
  durationMs,
  onJump,
  onSeekMs,
  onSectionsChange,
  onEditingChange,
  onClose,
  embedded = false,
}: TimingPanelProps) {
  tick('TimingPanel render')
  const positionMs = useLivePosition(position, positionRef, playing) * durationMs
  const moveRef = useRef<Move | null>(null)
  const [spot, setSpot] = useState({ left: 320, top: 96 })
  const [editingOffset, setEditingOffset] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [scroll, setScroll] = useState(0)
  const [viewport, setViewport] = useState(320)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const list = listRef.current
    if (!list) return

    const observer = new ResizeObserver(() => setViewport(list.clientHeight))
    observer.observe(list)
    setViewport(list.clientHeight)
    return () => observer.disconnect()
  }, [])

  const first = Math.max(0, Math.floor(scroll / CARD_STEP) - OVERSCAN)
  const last = Math.min(sections.length, Math.ceil((scroll + viewport) / CARD_STEP) + OVERSCAN)
  const visible = sections.slice(first, last)

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
        createSection(
          offsetMs,
          sections[sections.length - 1]?.bpm ?? 120,
          sections[sections.length - 1]?.meter,
        ),
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
        <IconButton
          size="small"
          title="Remove every section"
          aria-label="Remove every section"
          disabled={sections.length === 0}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => onSectionsChange([])}
        >
          <DeleteSweepIcon fontSize="small" />
        </IconButton>
        <IconButton
          size="small"
          title="Copy timing points"
          aria-label="Copy timing points"
          disabled={sections.length === 0}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => {
            void navigator.clipboard.writeText(writeTimingPoints(sections)).then(() => {
              setCopied(true)
              window.setTimeout(() => setCopied(false), 1500)
            })
          }}
        >
          {copied ? (
            <CheckIcon fontSize="small" color="success" />
          ) : (
            <ContentCopyIcon fontSize="small" />
          )}
        </IconButton>
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
        ref={listRef}
        onScroll={(event) => setScroll(event.currentTarget.scrollTop)}
        sx={{ p: 1.5, flex: 1, minHeight: 0, overflowY: 'auto' }}
      >
        {sections.length === 0 ? (
          <Typography variant="caption" color="text.secondary">
            No sections yet :(
          </Typography>
        ) : null}
        <Box sx={{ position: 'relative', height: sections.length * CARD_STEP }}>
        {visible.map((section) => {
          const index = sections.indexOf(section)
          const next = sections[index + 1]
          const endMs = next ? next.offsetMs : durationMs
          const active = positionMs >= section.offsetMs && (!next || positionMs < next.offsetMs)

          return (
            <Box
              key={section.id}
              onClick={() => onJump(section.offsetMs, endMs)}
              sx={{
                position: 'absolute',
                top: index * CARD_STEP,
                left: 0,
                right: 0,
                height: CARD_HEIGHT,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
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
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
                      <Typography variant="caption" sx={{ color: ACTION_INK, opacity: 0.8 }}>
                        /
                      </Typography>
                      <InputBase
                        value={section.meter}
                        inputProps={{
                          inputMode: 'numeric',
                          'aria-label': 'Beats in a bar',
                        }}
                        onChange={(event) => update(section.id, { meter: Number(event.target.value) })}
                        onFocus={() => onEditingChange(section.id)}
                        onBlur={() => onEditingChange(null)}
                        sx={{
                          width: 22,
                          color: ACTION_INK,
                          fontSize: (current) => current.typography.caption.fontSize,
                          '& input': { p: 0, textAlign: 'center' },
                        }}
                      />
                    </Box>
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
                  <IconButton
                    size="small"
                    title="Play from here"
                    aria-label="Play from section"
                    onClick={() => onSeekMs(section.offsetMs)}
                    sx={actionPill(active)}
                  >
                    <PlayArrowIcon sx={{ fontSize: 20 }} />
                  </IconButton>
                  <IconButton
                    size="small"
                    title="Remove section"
                    aria-label="Remove section"
                    onClick={() =>
                      onSectionsChange(sections.filter((current) => current.id !== section.id))
                    }
                    sx={actionPill(active)}
                  >
                    <DeleteOutlinedIcon sx={{ fontSize: 20 }} />
                  </IconButton>
                </Box>
              </Box>

            </Box>
          )
        })}
        </Box>
        <Box sx={{ display: 'flex', gap: 0.5, pt: 1 }}>
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
