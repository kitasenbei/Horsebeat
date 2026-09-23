import { useEffect, useRef, type ReactNode, type RefObject } from 'react'
import AppBar from '@mui/material/AppBar'
import Box from '@mui/material/Box'
import Toolbar from '@mui/material/Toolbar'
import Button from '@mui/material/Button'
import ButtonGroup from '@mui/material/ButtonGroup'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import FolderOpenIcon from '@mui/icons-material/FolderOpen'
import UndoIcon from '@mui/icons-material/Undo'
import RedoIcon from '@mui/icons-material/Redo'
import ViewHeadlineIcon from '@mui/icons-material/ViewHeadline'
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh'
import TuneIcon from '@mui/icons-material/Tune'
import ShowChartIcon from '@mui/icons-material/ShowChart'
import GridOnIcon from '@mui/icons-material/GridOn'
import SpeedIcon from '@mui/icons-material/Speed'
import CenterFocusStrongIcon from '@mui/icons-material/CenterFocusStrong'
import BeatLights from './BeatLights'
import Gallop from './Gallop'
import {
  BLOCK_LABELS,
  COLORMAPS,
  CURSOR_MODES,
  DIVISION_STEPS,
  SLICE_STEPS,
  WAVE_STYLES,
  type WaveStyle,
} from '../draw'
import { sectionSpans, type Section } from '../timing'
import { TRACING } from '../trace'

type TopBarProps = {
  sections: Section[]
  duration: number
  positionRef: RefObject<number>
  playing: boolean
  onOpen: () => void
  compiled: boolean
  onCompiledChange: (compiled: boolean) => void
  fitting: boolean
  canFit: boolean
  onFittingChange: (fitting: boolean) => void
  curved: boolean
  onCurvedChange: (curved: boolean) => void
  lane: number | 'all'
  onLaneChange: (lane: number | 'all') => void
  slice: number | 'auto'
  onSliceChange: (slice: number | 'auto') => void
  divisions: number
  onDivisionsChange: (divisions: number) => void
  colormap: number
  onColormapChange: (colormap: number) => void
  cursorMode: GlobalCompositeOperation
  onCursorModeChange: (mode: GlobalCompositeOperation) => void
  curveOpen: boolean
  onCurveOpenChange: (open: boolean) => void
  framesOpen: boolean
  onFramesOpenChange: (open: boolean) => void
  waveStyle: WaveStyle
  onWaveStyleChange: (style: WaveStyle) => void
  traceOpen: boolean
  onTraceOpenChange: (open: boolean) => void
  follow: boolean
  onFollowChange: (follow: boolean) => void
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
}

const MAX_LABEL = 10
const BRAND_FONT = "'Outfit', system-ui, sans-serif"
const BRAND_DARK = '#17161a'
const BRAND_GREEN = '#2f9e44'
const PULSE = 0.14
const DECAY = 7

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

const PICKER = {
  ...PILL,
  fontSize: 13,
  '& .MuiSelect-select': { py: 0.5, pl: 1.25, lineHeight: 1.4 },
  '& .MuiOutlinedInput-notchedOutline': { border: 0 },
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

// One shape for the four compiled-view pickers, so a picker costs a value and a
// list of options rather than another twelve lines of Select dressing.
function picker<T extends number | string>(
  label: string,
  value: T,
  options: { value: T; label: string }[],
  onChange: (next: T) => void,
) {
  return (
    <Select
      size="small"
      value={value}
      onChange={(event) => onChange(event.target.value as T)}
      inputProps={{ 'aria-label': label }}
      sx={PICKER}
    >
      {options.map((option) => (
        <MenuItem key={String(option.value)} value={option.value}>
          {option.label}
        </MenuItem>
      ))}
    </Select>
  )
}

export default function TopBar({
  sections,
  duration,
  positionRef,
  playing,
  onOpen,
  compiled,
  onCompiledChange,
  fitting,
  canFit,
  curved,
  onCurvedChange,
  onFittingChange,
  lane,
  onLaneChange,
  slice,
  onSliceChange,
  divisions,
  onDivisionsChange,
  colormap,
  onColormapChange,
  cursorMode,
  onCursorModeChange,
  curveOpen,
  onCurveOpenChange,
  framesOpen,
  onFramesOpenChange,
  waveStyle,
  onWaveStyleChange,
  traceOpen,
  onTraceOpenChange,
  follow,
  onFollowChange,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
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
            <span>
              <Button aria-label="Undo" disabled={!canUndo} onClick={onUndo}>
                {segment('Undo', <UndoIcon fontSize="small" />, true)}
              </Button>
            </span>
          </Tooltip>
          <Tooltip title="Redo">
            <span>
              <Button aria-label="Redo" disabled={!canRedo} onClick={onRedo}>
                {segment('Redo', <RedoIcon fontSize="small" />, true)}
              </Button>
            </span>
          </Tooltip>
        </ButtonGroup>

        <ToggleButtonGroup
          size="small"
          exclusive
          value={compiled ? 'compiled' : null}
          onChange={() => onCompiledChange(!compiled)}
          sx={PILL}
        >
          <ToggleButton value="compiled" aria-label="Compiled view" sx={selected('info')}>
            <Tooltip title="Compiled view">
              <span>{segment('Compiled', <ViewHeadlineIcon fontSize="small" />)}</span>
            </Tooltip>
          </ToggleButton>
        </ToggleButtonGroup>

        <ToggleButtonGroup
          size="small"
          exclusive
          value={fitting ? 'fit' : null}
          disabled={!canFit}
          onChange={() => onFittingChange(!fitting)}
          sx={PILL}
        >
          <ToggleButton value="fit" aria-label="Fit the grid to the audio" sx={selected('info')}>
            <Tooltip title="Fit the grid to the audio">
              <span>{segment('Fit', <AutoFixHighIcon fontSize="small" />)}</span>
            </Tooltip>
          </ToggleButton>
        </ToggleButtonGroup>

        <ToggleButtonGroup
          size="small"
          exclusive
          value={curved ? 'curved' : null}
          onChange={() => onCurvedChange(!curved)}
          sx={PILL}
        >
          <ToggleButton
            value="curved"
            aria-label="Read the audio through the amplitude curve when fitting"
            sx={selected('secondary')}
          >
            <Tooltip title="Fit through the amplitude curve">
              <span>{segment('Fit Apply', <TuneIcon fontSize="small" />)}</span>
            </Tooltip>
          </ToggleButton>
        </ToggleButtonGroup>

        {picker<number | 'all'>(
          'Lane shown in the compiled view',
          lane,
          [
            { value: 'all', label: 'All lanes' },
            ...BLOCK_LABELS.map((label, index) => ({ value: index, label })),
          ],
          onLaneChange,
        )}

        {picker<number | 'auto'>(
          'Beats per column',
          slice,
          [
            { value: 'auto', label: 'Auto' },
            ...SLICE_STEPS.map((entry) => ({ value: entry, label: `${entry} beats` })),
          ],
          onSliceChange,
        )}

        {picker<number>(
          'Guide divisions',
          divisions,
          DIVISION_STEPS.map((entry) => ({ value: entry, label: `/${entry}` })),
          onDivisionsChange,
        )}

        {lane === 0 || lane === 'all'
          ? picker<number>(
              'Colours',
              colormap,
              COLORMAPS.map((map, index) => ({ value: index, label: map.name })),
              onColormapChange,
            )
          : null}

        <ToggleButtonGroup
          size="small"
          exclusive
          value={curveOpen ? 'curve' : null}
          onChange={() => onCurveOpenChange(!curveOpen)}
          sx={PILL}
        >
          <ToggleButton value="curve" aria-label="Amplitude curve" sx={selected('secondary')}>
            <Tooltip title="Amplitude curve">
              <span>{segment('Curve', <ShowChartIcon fontSize="small" />)}</span>
            </Tooltip>
          </ToggleButton>
        </ToggleButtonGroup>

        <ToggleButtonGroup
          size="small"
          exclusive
          value={framesOpen ? 'frames' : null}
          onChange={() => onFramesOpenChange(!framesOpen)}
          sx={PILL}
        >
          <ToggleButton value="frames" aria-label="Beat frames" sx={selected('secondary')}>
            <Tooltip title="Beat frames">
              <span>{segment('Frames', <GridOnIcon fontSize="small" />)}</span>
            </Tooltip>
          </ToggleButton>
        </ToggleButtonGroup>

        {picker<WaveStyle>(
          'Wave and loud lane style',
          waveStyle,
          WAVE_STYLES.map((entry) => ({ value: entry.value, label: entry.label })),
          onWaveStyleChange,
        )}

        {picker<GlobalCompositeOperation>(
          'Position marker blend',
          cursorMode,
          CURSOR_MODES.map((entry) => ({ value: entry.value, label: entry.label })),
          onCursorModeChange,
        )}

        <ToggleButtonGroup
          size="small"
          exclusive
          value={follow ? 'follow' : null}
          onChange={() => onFollowChange(!follow)}
          sx={PILL}
        >
          <ToggleButton value="follow" aria-label="Follow the playhead" sx={selected('info')}>
            <Tooltip title="Hold the playhead's column in place and move the window under it">
              <span>{segment('Follow', <CenterFocusStrongIcon fontSize="small" />)}</span>
            </Tooltip>
          </ToggleButton>
        </ToggleButtonGroup>

        {TRACING ? (
          <ToggleButtonGroup
            size="small"
            exclusive
            value={traceOpen ? 'trace' : null}
            onChange={() => onTraceOpenChange(!traceOpen)}
            sx={PILL}
          >
            <ToggleButton value="trace" aria-label="Trace panel" sx={selected('secondary')}>
              <Tooltip title="What the app is running, a second at a time">
                <span>{segment('Trace', <SpeedIcon fontSize="small" />)}</span>
              </Tooltip>
            </ToggleButton>
          </ToggleButtonGroup>
        ) : null}

        <Box sx={{ flex: 1 }} />

        <Gallop
          sections={sections}
          duration={duration}
          positionRef={positionRef}
          playing={playing}
        />

        <BeatLights
          sections={sections}
          duration={duration}
          positionRef={positionRef}
          playing={playing}
          color={BRAND_GREEN}
        />

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
