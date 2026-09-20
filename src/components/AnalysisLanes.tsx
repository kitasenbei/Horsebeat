import Box from '@mui/material/Box'
import { alpha, useTheme } from '@mui/material/styles'
import { drawBands, drawHeatmap, drawLevels } from '../draw'
import { useCanvas } from '../useCanvas'
import type { Range } from '../range'

type AnalysisLanesProps = {
  loudness: Float32Array | null
  onsets: Float32Array | null
  bands: Float32Array | null
  range: Range
}

const LEVEL_HEIGHT = 20
const HEAT_HEIGHT = 16
const SPECTRUM_HEIGHT = 36
const GAP = 2

export const LANES_HEIGHT = LEVEL_HEIGHT + HEAT_HEIGHT + SPECTRUM_HEIGHT + GAP * 2

export default function AnalysisLanes({ loudness, onsets, bands, range }: AnalysisLanesProps) {
  const theme = useTheme()

  const canvasRef = useCanvas((context, width) => {
    if (loudness) {
      context.fillStyle = alpha(theme.palette.primary.main, 0.06)
      context.fillRect(0, 0, width, LEVEL_HEIGHT)
      drawLevels(context, loudness, range, width, LEVEL_HEIGHT)
    }

    context.save()
    context.translate(0, LEVEL_HEIGHT + GAP)
    if (onsets) drawHeatmap(context, onsets, range, width, HEAT_HEIGHT)
    context.translate(0, HEAT_HEIGHT + GAP)
    if (bands) drawBands(context, bands, range, width, SPECTRUM_HEIGHT)
    context.restore()
  })

  return (
    <Box
      component="canvas"
      ref={canvasRef}
      sx={{
        display: 'block',
        width: '100%',
        height: LANES_HEIGHT,
        flex: '0 0 auto',
        pointerEvents: 'none',
        borderRadius: 0.5,
      }}
    />
  )
}
