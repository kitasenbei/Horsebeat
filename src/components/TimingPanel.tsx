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
import ContentPasteIcon from '@mui/icons-material/ContentPaste'
import FileDownloadIcon from '@mui/icons-material/FileDownload'
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import TextField from '@mui/material/TextField'
import { readTimingPoints, writeTimingPoints } from '../osu'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import BpmPicker from './BpmPicker'
import { createSection, sortSections, type Section } from '../timing'
import { tick } from '../trace'
import { ROW, WELL } from '../theme'
import { liveSections, subscribeLiveSections } from '../liveSections'

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
  onExport?: () => void
  // snap one section's tempo and offset onto the music it covers
  onSnap?: (id: string) => void
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
// A section is a row of the panel: flat, a hairline beneath, and the one the
// playhead is in washed in the live colour
const CARD_IDLE = ROW

const ACTION_COLOR = 'rgba(255, 255, 255, 0.06)'
const ACTION_HOVER = 'rgba(255, 255, 255, 0.12)'
const ACTION_INK = '#dfe6e3'

const CARD_LIVE = 'rgba(79, 209, 165, 0.16)'
const LIVE_PILL = 'rgba(79, 209, 165, 0.2)'
const LIVE_PILL_HOVER = 'rgba(79, 209, 165, 0.32)'
const LIVE_INK = '#d9fff1'

const LIVE_POLL_MS = 250

const actionPill = {
  width: 30,
  height: 30,
  borderRadius: 0.75,
  bgcolor: ACTION_COLOR,
  color: ACTION_INK,
  '&:hover': { bgcolor: ACTION_HOVER, color: ACTION_INK },
  '[data-live="true"] &': { bgcolor: LIVE_PILL, color: LIVE_INK },
  '[data-live="true"] &:hover': { bgcolor: LIVE_PILL_HOVER, color: LIVE_INK },
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
  onExport,
  onSnap,
  onClose,
  embedded = false,
}: TimingPanelProps) {
  tick('TimingPanel render')
  // the card under the playhead is marked with an attribute on its element
  // and styled from that, so following the playhead is a poll that sets an
  // attribute on a few nodes rather than a render of every card on screen
  const liveIdRef = useRef<string | null>(null)
  const liveIdAt = (at: number) => {
    const ms = at * durationMs
    const sorted = sortSections(sections)
    const index = sorted.findIndex((section, order) => {
      const next = sorted[order + 1]
      return ms >= section.offsetMs && (!next || ms < next.offsetMs)
    })
    return index >= 0 ? sorted[index].id : null
  }
  // rendered from the app's position, which is right while paused; playing,
  // the poll below marks the cards again straight after every render
  const activeId = liveIdAt(position)

  // While a section is dragged elsewhere its card shows the drag: the tempo
  // and the offset are written into the card's text by hand, the way the live
  // mark is, so a drag frame renders no card. The render after the release
  // writes the same numbers back through React
  useEffect(() => {
    return subscribeLiveSections(() => {
      const list = listRef.current
      if (!list) return
      const live = liveSections(sections)
      for (const card of list.querySelectorAll<HTMLElement>('[data-section]')) {
        const section = live.find((item) => item.id === card.dataset.section)
        if (!section) continue
        const bpm = card.querySelector<HTMLElement>('[data-field="bpm"]')
        if (bpm) {
          const text = `${section.bpm.toFixed(2)} BPM`
          if (bpm.textContent !== text) bpm.textContent = text
        }
        const offset = card.querySelector<HTMLElement>('[data-field="offset"] .MuiChip-label')
        if (offset) {
          const text = `${Math.round(section.offsetMs)} ms`
          if (offset.textContent !== text) offset.textContent = text
        }
      }
    })
  })

  useEffect(() => {
    if (!playing) return
    const mark = () => {
      const id = liveIdAt(positionRef.current)
      if (id === liveIdRef.current) return
      liveIdRef.current = id
      const list = listRef.current
      if (!list) return
      for (const card of list.querySelectorAll<HTMLElement>('[data-section]')) {
        card.dataset.live = String(card.dataset.section === id)
      }
    }
    mark()
    const timer = window.setInterval(mark, LIVE_POLL_MS)
    return () => window.clearInterval(timer)
  })
  const moveRef = useRef<Move | null>(null)
  const [spot, setSpot] = useState({ left: 320, top: 96 })
  const [editingOffset, setEditingOffset] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  // pasted timing points, imported in place of the sections or alongside them
  const [importOpen, setImportOpen] = useState(false)
  const [importText, setImportText] = useState('')
  const imported = readTimingPoints(importText)
  const finishImport = (next: Section[]) => {
    onSectionsChange(sortSections(next))
    setImportOpen(false)
    setImportText('')
  }
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
      sx={
        embedded
          ? {
              width: '100%',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              borderRadius: 1.5,
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
          minHeight: 32,
          cursor: embedded ? 'default' : 'move',
          touchAction: 'none',
        }}
      >
        {embedded ? null : <DragIndicatorIcon fontSize="small" sx={{ color: 'text.disabled' }} />}
        <Typography
          variant="body2"
          sx={{
            flex: 1,
            fontWeight: 600,
            userSelect: 'none',
            position: 'relative',
            alignSelf: 'stretch',
            display: 'flex',
            alignItems: 'center',
            '&::after': {
              content: '""',
              position: 'absolute',
              left: 0,
              bottom: 2,
              width: 28,
              height: 2,
              borderRadius: 1,
              bgcolor: 'primary.main',
            },
          }}
        >
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
        <IconButton
          size="small"
          title="Export as .osz"
          aria-label="Export as .osz"
          disabled={!onExport || sections.length === 0}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => onExport?.()}
        >
          <FileDownloadIcon fontSize="small" />
        </IconButton>
        <IconButton
          size="small"
          title="Import timing points"
          aria-label="Import timing points"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => setImportOpen(true)}
        >
          <ContentPasteIcon fontSize="small" />
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
          const active = section.id === activeId

          return (
            <Box
              key={section.id}
              data-section={section.id}
              data-live={String(active)}
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
                borderRadius: 1.5,
                bgcolor: CARD_IDLE,
                color: 'text.primary',
                cursor: 'pointer',
                '&:hover': { filter: 'brightness(1.08)' },
                '&[data-live="true"]': {
                  bgcolor: CARD_LIVE,
                  color: 'text.primary',
                },
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
                          borderRadius: 0.75,
                          bgcolor: WELL,
                          color: ACTION_INK,
                          '[data-live="true"] &': { color: LIVE_INK },
                          fontSize: (current) => current.typography.caption.fontSize,
                          '& input': { p: 0, textAlign: 'center' },
                        }}
                      />
                    ) : (
                      <Chip
                        size="small"
                        data-field="offset"
                        label={`${Math.round(section.offsetMs)} ms`}
                        onClick={() => {
                          setEditingOffset(section.id)
                          onEditingChange(section.id)
                        }}
                        sx={{
                          bgcolor: ACTION_COLOR,
                          color: ACTION_INK,
                          fontWeight: 600,
                          '&:hover': { bgcolor: ACTION_HOVER },
                          '[data-live="true"] &': { bgcolor: LIVE_PILL, color: LIVE_INK },
                          '[data-live="true"] &:hover': { bgcolor: LIVE_PILL_HOVER },
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
                    // three pills as a triangle: play and snap on the top row,
                    // remove below between them, so the card stays two rows tall
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, 34px)',
                    justifyItems: 'center',
                    alignContent: 'center',
                    gap: 0.5,
                    flex: '0 0 auto',
                  }}
                >
                  <IconButton
                    size="small"
                    title="Play from here"
                    aria-label="Play from section"
                    onClick={() => onSeekMs(section.offsetMs)}
                    sx={actionPill}
                  >
                    <PlayArrowIcon sx={{ fontSize: 20 }} />
                  </IconButton>
                  <IconButton
                    size="small"
                    title="Snap to the music"
                    aria-label="Snap section to the music"
                    disabled={!onSnap}
                    onClick={() => onSnap?.(section.id)}
                    sx={actionPill}
                  >
                    <AutoFixHighIcon sx={{ fontSize: 20 }} />
                  </IconButton>
                  <IconButton
                    size="small"
                    title="Remove section"
                    aria-label="Remove section"
                    onClick={() =>
                      onSectionsChange(sections.filter((current) => current.id !== section.id))
                    }
                    sx={{ ...actionPill, gridColumn: '1 / span 2' }}
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
            onClick={() => add((playing ? positionRef.current : position) * durationMs)}
            sx={{ textTransform: 'none' }}
          >
            At playhead
          </Button>
        </Box>
      </Box>
      <Dialog open={importOpen} onClose={() => setImportOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Import timing points</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            multiline
            minRows={6}
            maxRows={14}
            fullWidth
            value={importText}
            onChange={(event) => setImportText(event.target.value)}
            placeholder="0,500,4,2,0,60,1,0"
            helperText={
              importText.trim() === ''
                ? 'Timing points as osu! writes them, a whole .osu file or just its lines'
                : `${imported.length} ${imported.length === 1 ? 'section' : 'sections'} found`
            }
            slotProps={{ input: { sx: { fontFamily: 'monospace', fontSize: 13 } } }}
          />
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              void navigator.clipboard.readText().then(
                (text) => setImportText(text),
                () => undefined,
              )
            }}
          >
            Paste
          </Button>
          <Box sx={{ flex: 1 }} />
          <Button onClick={() => setImportOpen(false)}>Cancel</Button>
          <Button
            disabled={imported.length === 0}
            onClick={() => {
              // added beside the sections here, a pasted one landing on an
              // existing offset takes its place
              const kept = sections.filter(
                (section) => !imported.some((next) => Math.abs(next.offsetMs - section.offsetMs) < 1),
              )
              finishImport([...kept, ...imported])
            }}
          >
            Add
          </Button>
          <Button variant="contained" disabled={imported.length === 0} onClick={() => finishImport(imported)}>
            Replace
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  )
}
