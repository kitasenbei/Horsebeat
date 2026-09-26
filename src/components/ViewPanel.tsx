import type { ReactNode } from 'react'
import Box from '@mui/material/Box'
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
import ToggleButton from '@mui/material/ToggleButton'
import Typography from '@mui/material/Typography'
import PanelHeader from './PanelHeader'
import {
  BLOCK_LABELS,
  COLORMAPS,
  CURSOR_MODES,
  DIVISION_STEPS,
  SLICE_STEPS,
  SUBDIVISION_STEPS,
  WAVE_STYLES,
  type WaveStyle,
} from '../draw'
import { ROW, WELL } from '../theme'

type ViewPanelProps = {
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
  waveStyle: WaveStyle
  onWaveStyleChange: (style: WaveStyle) => void
  cursorMode: GlobalCompositeOperation
  onCursorModeChange: (mode: GlobalCompositeOperation) => void
}

// How the compiled view is drawn, as a list of settings: each a row of the
// panel with its name on the left and its control on the right, the way a
// workstation's inspector lays a thing's properties out. Nothing here is
// reached for while playing, so it lives in a panel and not on the bar
function row(label: string, control: ReactNode) {
  return (
    <Box
      key={label}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        px: 1.25,
        py: 0.75,
        borderRadius: 1.5,
        bgcolor: ROW,
      }}
    >
      <Typography variant="body2" sx={{ flex: 1, color: 'text.secondary' }}>
        {label}
      </Typography>
      {control}
    </Box>
  )
}

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

function choice<T extends number | string>(
  label: string,
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
    <Select
      size="small"
      value={value}
      onChange={(event) => onChange(event.target.value as T)}
      inputProps={{ 'aria-label': label }}
      renderValue={(picked) => {
        const option = options.find((entry) => entry.value === picked)
        return option ? shown(option) : String(picked)
      }}
      sx={{
        width: 148,
        bgcolor: WELL,
        '& .MuiSelect-select': { display: 'flex', alignItems: 'center', gap: 0.75, py: '5px' },
      }}
    >
      {options.map((option) => (
        <MenuItem key={String(option.value)} value={option.value} sx={{ gap: 0.75 }}>
          {shown(option)}
        </MenuItem>
      ))}
    </Select>
  )
}

function onOff(label: string, on: boolean, onChange: (next: boolean) => void) {
  return (
    <ToggleButton
      value="on"
      selected={on}
      onChange={() => onChange(!on)}
      aria-label={label}
      sx={{ width: 148, bgcolor: WELL, py: '5px', justifyContent: 'center' }}
    >
      {on ? 'On' : 'Off'}
    </ToggleButton>
  )
}

export default function ViewPanel({
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
  waveStyle,
  onWaveStyleChange,
  cursorMode,
  onCursorModeChange,
}: ViewPanelProps) {
  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <PanelHeader title="Compiled view" />
      <Box sx={{ p: 1, display: 'flex', flexDirection: 'column', gap: 0.5, overflowY: 'auto' }}>
        {row(
          'Lane',
          choice<number | 'all'>(
            'Lane shown',
            lane,
            [{ value: 'all', label: 'All lanes' }, ...BLOCK_LABELS.map((label, index) => ({ value: index, label }))],
            onLaneChange,
          ),
        )}
        {row(
          'Slice',
          choice<number | 'auto'>(
            'Beats per column',
            slice,
            [{ value: 'auto', label: 'Auto' }, ...SLICE_STEPS.map((entry) => ({ value: entry, label: `${entry} beats` }))],
            onSliceChange,
          ),
        )}
        {row(
          'Grid',
          choice<number>(
            'Guide divisions',
            divisions,
            DIVISION_STEPS.map((entry) => ({ value: entry, label: `/${entry}` })),
            onDivisionsChange,
          ),
        )}
        {row(
          'Sub-grid',
          choice<number>(
            'Guide subdivisions',
            subdivisions,
            SUBDIVISION_STEPS.map((entry) => ({ value: entry, label: entry === 1 ? 'None' : `×${entry}` })),
            onSubdivisionsChange,
          ),
        )}
        {row('Beats between guides', onOff('Beats between guides', centred, onCentredChange))}
        {row(
          'Colours',
          choice<number>(
            'Colours',
            colormap,
            COLORMAPS.map((map, index) => ({ value: index, label: map.name, swatch: map.stops })),
            onColormapChange,
          ),
        )}
        {row(
          'Lane style',
          choice<WaveStyle>(
            'Wave and loud lane style',
            waveStyle,
            WAVE_STYLES.map((entry) => ({ value: entry.value, label: entry.label })),
            onWaveStyleChange,
          ),
        )}
        {row(
          'Marker',
          choice<GlobalCompositeOperation>(
            'Position marker blend',
            cursorMode,
            CURSOR_MODES.map((entry) => ({ value: entry.value, label: entry.label })),
            onCursorModeChange,
          ),
        )}
      </Box>
    </Box>
  )
}
