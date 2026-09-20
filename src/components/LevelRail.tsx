import Box from '@mui/material/Box'
import { alpha, useTheme } from '@mui/material/styles'
import { drawLevels } from '../draw'
import { useCanvas } from '../useCanvas'
import type { Range } from '../range'

type LevelRailProps = {
  values: Float32Array | null
  range: Range
}

export const LEVEL_HEIGHT = 20

export default function LevelRail({ values, range }: LevelRailProps) {
  const theme = useTheme()

  const canvasRef = useCanvas((context, width, height) => {
    if (!values) return
    drawLevels(context, values, range, width, height)
  })

  return (
    <Box
      component="canvas"
      ref={canvasRef}
      sx={{
        display: 'block',
        width: '100%',
        height: LEVEL_HEIGHT,
        flex: '0 0 auto',
        pointerEvents: 'none',
        bgcolor: alpha(theme.palette.primary.main, 0.06),
        borderRadius: 0.5,
      }}
    />
  )
}
