import { useRef } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import ToggleButton from '@mui/material/ToggleButton'
import Typography from '@mui/material/Typography'
import PanelHeader from './PanelHeader'
import RulerSlider from './RulerSlider'
import { ROW, WELL } from '../theme'

type LookPanelProps = {
  // the picture laid faintly over the whole app, if any, and how strongly
  background: string | null
  dim: number
  onBackgroundChange: (file: File | null) => void
  onDimChange: (dim: number) => void
  // whether a beatmap's own picture is taken up when one is opened
  useBeatmap: boolean
  onUseBeatmapChange: (use: boolean) => void
  // whether the shell takes its tones from the picture
  wallTones: boolean
  onWallTonesChange: (use: boolean) => void
}

// How the app looks, as opposed to what it shows: a picture of the user's
// own behind everything, faint enough to be a mood rather than a background
export const DIM_DEFAULT = 4
const DIM_MAX = 40

export default function LookPanel({
  background,
  dim,
  onBackgroundChange,
  onDimChange,
  useBeatmap,
  onUseBeatmapChange,
  wallTones,
  onWallTonesChange,
}: LookPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <PanelHeader title="Look" />
      <Box sx={{ p: 1, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        <Box sx={{ borderRadius: 1.5, bgcolor: ROW, p: 1.25, display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            Background picture
          </Typography>
          <Box
            sx={{
              height: 96,
              borderRadius: 1,
              backgroundColor: 'background.default',
              backgroundImage: background ? `url(${background})` : undefined,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          />
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            <Button variant="contained" onClick={() => inputRef.current?.click()} sx={{ flex: 1 }}>
              Choose picture
            </Button>
            <Button disabled={!background} onClick={() => onBackgroundChange(null)}>
              Clear
            </Button>
          </Box>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0] ?? null
              if (file) onBackgroundChange(file)
              event.target.value = ''
            }}
          />
        </Box>
        <Box sx={{ borderRadius: 1.5, bgcolor: ROW, px: 1.25, py: 0.75, display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="body2" sx={{ flex: 1, color: 'text.secondary' }}>
            Use the beatmap's picture
          </Typography>
          <ToggleButton
            value="on"
            selected={useBeatmap}
            onChange={() => onUseBeatmapChange(!useBeatmap)}
            aria-label="Use the beatmap's picture"
            sx={{ width: 148, bgcolor: WELL, py: '5px', justifyContent: 'center' }}
          >
            {useBeatmap ? 'On' : 'Off'}
          </ToggleButton>
        </Box>
        <Box sx={{ borderRadius: 1.5, bgcolor: ROW, px: 1.25, py: 0.75, display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="body2" sx={{ flex: 1, color: 'text.secondary' }}>
            Colours from the picture
          </Typography>
          <ToggleButton
            value="on"
            selected={wallTones}
            disabled={!background}
            onChange={() => onWallTonesChange(!wallTones)}
            aria-label="Colours from the picture"
            sx={{ width: 148, bgcolor: WELL, py: '5px', justifyContent: 'center' }}
          >
            {wallTones ? 'On' : 'Off'}
          </ToggleButton>
        </Box>
        <Box sx={{ borderRadius: 1.5, bgcolor: ROW, px: 1.25, py: 0.75, display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="body2" sx={{ flex: 1, color: 'text.secondary' }}>
            Strength
          </Typography>
          <Box sx={{ width: 148 }}>
            <RulerSlider
              value={dim}
              min={0}
              max={DIM_MAX}
              step={1}
              pixelsPerStep={5}
              format={(value) => `${value}%`}
              fill
              onChange={onDimChange}
            />
          </Box>
        </Box>
      </Box>
    </Box>
  )
}
