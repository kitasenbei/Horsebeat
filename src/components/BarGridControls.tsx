import Paper from '@mui/material/Paper'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import { BLOCK_LABELS, SLICE_STEPS } from '../draw'

type BarGridControlsProps = {
  lane: number | 'all'
  slice: number | 'auto'
  onLaneChange: (lane: number | 'all') => void
  onSliceChange: (slice: number | 'auto') => void
}

// Rendered under the compiled view rather than over it: these are twenty MUI
// buttons, and inside the view they would both cover the picture and re-render
// on every pointer move and every frame of a drag.
export default function BarGridControls({
  lane,
  slice,
  onLaneChange,
  onSliceChange,
}: BarGridControlsProps) {
  return (
    <Paper
      elevation={3}
      sx={{
        alignSelf: 'flex-end',
        display: 'flex',
        gap: 0.5,
        borderRadius: 999,
        overflow: 'hidden',
      }}
    >
      <ToggleButtonGroup
        size="small"
        exclusive
        value={lane}
        onChange={(_, next) => {
          if (next !== null) onLaneChange(next as number | 'all')
        }}
        sx={{ '& .MuiToggleButton-root': { px: 0.75, py: 0.25, border: 0, fontSize: 11 } }}
      >
        <ToggleButton value="all" aria-label="Every lane">
          all
        </ToggleButton>
        {BLOCK_LABELS.map((label, index) => (
          <ToggleButton key={label} value={index} aria-label={`${label} lane only`}>
            {label.toLowerCase()}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
      <ToggleButtonGroup
        size="small"
        exclusive
        value={slice}
        onChange={(_, next) => {
          if (next !== null) onSliceChange(next as number | 'auto')
        }}
        sx={{ '& .MuiToggleButton-root': { px: 0.75, py: 0.25, border: 0, fontSize: 11 } }}
      >
        <ToggleButton value="auto" aria-label="Automatic slice length">
          auto
        </ToggleButton>
        {SLICE_STEPS.map((entry) => (
          <ToggleButton key={entry} value={entry} aria-label={`${entry} beats per column`}>
            {entry}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
    </Paper>
  )
}
