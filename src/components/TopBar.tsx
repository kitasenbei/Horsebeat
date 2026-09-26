import type { ReactNode } from 'react'
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
import Divider from '@mui/material/Divider'
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
import VerticalAlignCenterIcon from '@mui/icons-material/VerticalAlignCenter'
import {
  BLOCK_LABELS,
  COLORMAPS,
  CURSOR_MODES,
  DIVISION_STEPS,
  SUBDIVISION_STEPS,
  SLICE_STEPS,
  WAVE_STYLES,
  type WaveStyle,
} from '../draw'
import { TRACING } from '../trace'
import { WELL } from '../theme'

type TopBarProps = {
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
  subdivisions: number
  onSubdivisionsChange: (subdivisions: number) => void
  centred: boolean
  onCentredChange: (centred: boolean) => void
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

// labels are never cut: a control the eye cannot read is a control it cannot
// trust, and the toolbar wraps to a second row before it hides a word
const MAX_LABEL = 40

// a group of controls: a well with a hairline, its buttons flat and square
const PILL = {
  borderRadius: 0.75,
  overflow: 'hidden',
  border: 1,
  borderColor: 'divider',
  bgcolor: WELL,
  '& .MuiButtonBase-root': {
    textTransform: 'none',
    border: 0,
    borderRadius: 0,
    px: 1,
    py: 0.5,
    minWidth: 0,
    minHeight: 26,
    color: 'text.primary',
    lineHeight: 1,
    fontSize: 12,
  },
  '& .MuiButtonBase-root:not(:first-of-type)': {
    borderLeft: 1,
    borderColor: 'divider',
  },
}

// A picker names itself: a caption in small caps sits over the value in the
// same well, so the field says what it is without growing wider. The toggles
// beside it carry their own word
const PICKER = {
  ...PILL,
  fontSize: 12,
  '& .MuiSelect-select': {
    // the theme sets the select's padding by class, so the taller field
    // says its own
    paddingTop: '13px !important',
    paddingBottom: '3px !important',
    pl: 1,
    pr: '24px !important',
    lineHeight: 1.2,
    minHeight: 0,
    display: 'flex',
    alignItems: 'center',
    gap: 0.75,
  },
  '& .MuiOutlinedInput-notchedOutline': { border: 0 },
  '& .MuiSelect-icon': { right: 2, top: 'calc(50% - 10px)' },
}
// the caption is drawn over the field's well, so it stands above it
const CAPTION = {
  position: 'absolute',
  zIndex: 1,
  top: 4,
  left: 8,
  fontSize: 8,
  lineHeight: 1,
  letterSpacing: 0.6,
  textTransform: 'uppercase',
  color: 'text.secondary',
  pointerEvents: 'none',
  userSelect: 'none',
}

// a colormap shown as itself: a strip of its stops, which needs no word
function swatch(stops: string[]) {
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-block',
        width: 34,
        height: 10,
        borderRadius: 0.5,
        background: `linear-gradient(to right, ${stops.join(', ')})`,
        flex: '0 0 auto',
      }}
    />
  )
}

// a pressed toggle is lit in the shell's one accent, whatever it stands for:
// the colour says on, the label says what
function selected(_palette: 'primary' | 'secondary' | 'info') {
  return {
    '&.Mui-selected': {
      bgcolor: 'rgba(47, 179, 163, 0.22)',
      color: '#e8fffb',
      '&:hover': { bgcolor: 'rgba(47, 179, 163, 0.3)' },
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
  caption: string,
  value: T,
  options: { value: T; label: string; swatch?: string[] }[],
  onChange: (next: T) => void,
) {
  const shown = (option: { label: string; swatch?: string[] }) =>
    option.swatch ? (
      <>
        {swatch(option.swatch)}
        {option.label}
      </>
    ) : (
      option.label
    )
  return (
    <Box sx={{ position: 'relative', flex: '0 0 auto' }}>
      <Box component="span" sx={CAPTION}>
        {caption}
      </Box>
      <Select
        size="small"
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        inputProps={{ 'aria-label': label }}
        renderValue={(picked) => {
          const option = options.find((entry) => entry.value === picked)
          return option ? shown(option) : String(picked)
        }}
        sx={PICKER}
      >
        {options.map((option) => (
          <MenuItem key={String(option.value)} value={option.value} sx={{ gap: 0.75 }}>
            {shown(option)}
          </MenuItem>
        ))}
      </Select>
    </Box>
  )
}

export default function TopBar({
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
  subdivisions,
  onSubdivisionsChange,
  centred,
  onCentredChange,
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
  return (
    <AppBar position="static" color="default" elevation={0}>
      <Toolbar
        variant="dense"
        disableGutters
        sx={{ px: 1, py: 0.5, gap: 0.75, rowGap: 0.5, flexWrap: 'wrap', minHeight: 0 }}
      >
        <Button
          size="small"
          variant="contained"
          disableElevation
          startIcon={<FolderOpenIcon />}
          onClick={onOpen}
          sx={{ px: 1.25 }}
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

        <Divider orientation="vertical" flexItem sx={{ my: 0.5, mx: 0.25 }} />

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

        <Divider orientation="vertical" flexItem sx={{ my: 0.5, mx: 0.25 }} />

        {picker<number | 'all'>(
          'Lane shown in the compiled view',
          'Lane',
          lane,
          [
            { value: 'all', label: 'All lanes' },
            ...BLOCK_LABELS.map((label, index) => ({ value: index, label })),
          ],
          onLaneChange,
        )}

        {picker<number | 'auto'>(
          'Beats per column',
          'Slice',
          slice,
          [
            { value: 'auto', label: 'Auto' },
            ...SLICE_STEPS.map((entry) => ({ value: entry, label: `${entry} beats` })),
          ],
          onSliceChange,
        )}

        {picker<number>(
          'Guide divisions',
          'Grid',
          divisions,
          DIVISION_STEPS.map((entry) => ({ value: entry, label: `/${entry}` })),
          onDivisionsChange,
        )}

        {picker<number>(
          'Guide subdivisions',
          'Sub',
          subdivisions,
          SUBDIVISION_STEPS.map((entry) => ({ value: entry, label: entry === 1 ? 'none' : `×${entry}` })),
          onSubdivisionsChange,
        )}

        <ToggleButtonGroup
          size="small"
          exclusive
          value={centred ? 'centred' : null}
          onChange={() => onCentredChange(!centred)}
          sx={PILL}
        >
          <ToggleButton value="centred" aria-label="Beats away from the seams" sx={selected('secondary')}>
            <Tooltip title="Move the picture and the guides down by half a division, so the beats sit away from the column seams">
              <span>{segment('Between', <VerticalAlignCenterIcon fontSize="small" />)}</span>
            </Tooltip>
          </ToggleButton>
        </ToggleButtonGroup>

        {lane === 0 || lane === 4 || lane === 5 || lane === 'all'
          ? picker<number>(
              'Colours',
              'Map',
              colormap,
              COLORMAPS.map((map, index) => ({ value: index, label: map.name, swatch: map.stops })),
              onColormapChange,
            )
          : null}

        <Divider orientation="vertical" flexItem sx={{ my: 0.5, mx: 0.25 }} />

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
          'Style',
          waveStyle,
          WAVE_STYLES.map((entry) => ({ value: entry.value, label: entry.label })),
          onWaveStyleChange,
        )}

        {picker<GlobalCompositeOperation>(
          'Position marker blend',
          'Marker',
          cursorMode,
          CURSOR_MODES.map((entry) => ({ value: entry.value, label: entry.label })),
          onCursorModeChange,
        )}

        <Divider orientation="vertical" flexItem sx={{ my: 0.5, mx: 0.25 }} />

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

      </Toolbar>
    </AppBar>
  )
}
