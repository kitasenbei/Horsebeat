import { useEffect, useRef, type ReactNode, type RefObject } from 'react'
import AppBar from '@mui/material/AppBar'
import Box from '@mui/material/Box'
import Toolbar from '@mui/material/Toolbar'
import Button from '@mui/material/Button'
import ButtonGroup from '@mui/material/ButtonGroup'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import FolderOpenIcon from '@mui/icons-material/FolderOpen'
import UndoIcon from '@mui/icons-material/Undo'
import RedoIcon from '@mui/icons-material/Redo'
import GraphicEqIcon from '@mui/icons-material/GraphicEq'
import BarChartIcon from '@mui/icons-material/BarChart'
import ShowChartIcon from '@mui/icons-material/ShowChart'
import BookmarkIcon from '@mui/icons-material/Bookmark'
import StraightenIcon from '@mui/icons-material/Straighten'
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep'
import GpsFixedIcon from '@mui/icons-material/GpsFixed'
import { VIEW_MODES, type ViewMode } from '../view'
import type { EditMode } from '../mode'
import { sectionSpans, type Section } from '../timing'

type TopBarProps = {
  view: ViewMode
  mode: EditMode
  sections: Section[]
  duration: number
  positionRef: RefObject<number>
  playing: boolean
  onOpen: () => void
  onViewChange: (view: ViewMode) => void
  onModeChange: (mode: EditMode) => void
  onClearMarkers: () => void
  follow: boolean
  onFollowChange: (follow: boolean) => void
}

const MAX_LABEL = 10
const BRAND_FONT = "'Outfit', system-ui, sans-serif"
const BRAND_DARK = '#17161a'
const BRAND_GREEN = '#2f9e44'
const PULSE = 0.14
const DECAY = 7

const VIEW_ICONS: Record<ViewMode, ReactNode> = {
  amplitude: <GraphicEqIcon fontSize="small" />,
  bars: <BarChartIcon fontSize="small" />,
  outline: <ShowChartIcon fontSize="small" />,
}

const MODE_ICONS: Record<'marker' | 'section', ReactNode> = {
  marker: <BookmarkIcon fontSize="small" />,
  section: <StraightenIcon fontSize="small" />,
}

const PILL = {
  borderRadius: 999,
  overflow: 'hidden',
  border: 1,
  borderColor: 'divider',
  bgcolor: 'background.paper',
  '& .MuiButtonBase-root': {
    textTransform: 'none',
    border: 0,
    borderRadius: 0,
    px: 1.25,
    py: 0.5,
    minWidth: 0,
    color: 'text.primary',
    lineHeight: 1,
  },
  '& .MuiButtonBase-root:not(:first-of-type)': {
    borderLeft: 1,
    borderColor: 'divider',
  },
}

function selected(palette: 'primary' | 'secondary' | 'info') {
  return {
    '&.Mui-selected': {
      bgcolor: `${palette}.main`,
      color: `${palette}.contrastText`,
      '&:hover': { bgcolor: `${palette}.dark` },
    },
  }
}

function segment(label: string, icon: ReactNode, iconOnly = false) {
  if (iconOnly || label.length > MAX_LABEL) return icon
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
      {icon}
      {label}
    </Box>
  )
}

export default function TopBar({
  view,
  mode,
  sections,
  duration,
  positionRef,
  playing,
  onOpen,
  onViewChange,
  onModeChange,
  onClearMarkers,
  follow,
  onFollowChange,
}: TopBarProps) {
  const brandRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const node = brandRef.current
    if (!node) return

    const spans = sectionSpans(sections, duration)
    if (!playing || spans.length === 0) {
      node.style.transform = 'scale(1)'
      return
    }

    let frame = requestAnimationFrame(function tick() {
      const at = positionRef.current
      const item = spans.find((span) => at >= span.start && at <= span.end) ?? spans[0]
      const phase = item.beat > 0 ? (((at - item.start) / item.beat) % 1 + 1) % 1 : 0
      node.style.transform = `scale(${1 + PULSE * Math.exp(-phase * DECAY)})`
      frame = requestAnimationFrame(tick)
    })

    return () => {
      cancelAnimationFrame(frame)
      node.style.transform = 'scale(1)'
    }
  }, [playing, sections, duration, positionRef])

  return (
    <AppBar position="static" color="default" elevation={0}>
      <Toolbar variant="dense" disableGutters sx={{ px: 1, gap: 1 }}>
        <Button
          size="small"
          variant="contained"
          disableElevation
          startIcon={<FolderOpenIcon />}
          onClick={onOpen}
          sx={{ borderRadius: 999, textTransform: 'none', px: 1.5 }}
        >
          Open
        </Button>

        <ButtonGroup size="small" variant="text" color="inherit" sx={PILL}>
          <Tooltip title="Undo">
            <Button aria-label="Undo">{segment('Undo', <UndoIcon fontSize="small" />, true)}</Button>
          </Tooltip>
          <Tooltip title="Redo">
            <Button aria-label="Redo">{segment('Redo', <RedoIcon fontSize="small" />, true)}</Button>
          </Tooltip>
        </ButtonGroup>

        <ToggleButtonGroup
          size="small"
          exclusive
          value={view}
          onChange={(_, next) => {
            if (next !== null) onViewChange(next as ViewMode)
          }}
          sx={PILL}
        >
          {VIEW_MODES.map((entry) => (
            <ToggleButton
              key={entry.mode}
              value={entry.mode}
              aria-label={entry.label}
              sx={selected('primary')}
            >
              <Tooltip title={entry.label}>
                <span>{segment(entry.label, VIEW_ICONS[entry.mode])}</span>
              </Tooltip>
            </ToggleButton>
          ))}
        </ToggleButtonGroup>

        <ToggleButtonGroup
          size="small"
          exclusive
          value={mode === 'none' ? null : mode}
          onChange={(_, next) => onModeChange((next as EditMode | null) ?? 'none')}
          sx={PILL}
        >
          <ToggleButton value="marker" aria-label="Marker mode" sx={selected('secondary')}>
            <Tooltip title="Marker mode">
              <span>{segment('Marker', MODE_ICONS.marker)}</span>
            </Tooltip>
          </ToggleButton>
          <ToggleButton value="section" aria-label="Section mode" sx={selected('info')}>
            <Tooltip title="Section mode">
              <span>{segment('Section', MODE_ICONS.section)}</span>
            </Tooltip>
          </ToggleButton>
        </ToggleButtonGroup>

        <ButtonGroup size="small" variant="text" color="inherit" sx={PILL}>
          <Tooltip title="Clear markers">
            <Button
              aria-label="Clear markers"
              onClick={onClearMarkers}
              sx={{ color: 'error.main' }}
            >
              {segment('Clear', <DeleteSweepIcon fontSize="small" />)}
            </Button>
          </Tooltip>
        </ButtonGroup>

        <ToggleButtonGroup
          size="small"
          exclusive
          value={follow ? 'follow' : null}
          onChange={() => onFollowChange(!follow)}
          sx={PILL}
        >
          <ToggleButton value="follow" aria-label="Follow playhead" sx={selected('primary')}>
            <Tooltip title="Follow playhead">
              <span>{segment('Follow', <GpsFixedIcon fontSize="small" />)}</span>
            </Tooltip>
          </ToggleButton>
        </ToggleButtonGroup>

        <Box sx={{ flex: 1 }} />

        <Typography
          component="span"
          ref={brandRef}
          sx={{
            transformOrigin: 'center right',
            willChange: 'transform',
            fontFamily: BRAND_FONT,
            fontWeight: 800,
            fontSize: 24,
            lineHeight: 1,
            letterSpacing: 0.2,
            pr: 1,
            color: BRAND_DARK,
          }}
        >
          Horse
          <Box component="span" sx={{ color: BRAND_GREEN, fontWeight: 800 }}>
            Beat
          </Box>
        </Typography>
      </Toolbar>
    </AppBar>
  )
}
