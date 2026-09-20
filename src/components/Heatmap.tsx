import Box from '@mui/material/Box'
import { drawHeatmap } from '../draw'
import { useCanvas } from '../useCanvas'
import type { Range } from '../range'

type HeatmapProps = {
  values: Float32Array | null
  range: Range
}

export const HEATMAP_HEIGHT = 16

export default function Heatmap({ values, range }: HeatmapProps) {
  const canvasRef = useCanvas((context, width, height) => {
    if (!values) return
    drawHeatmap(context, values, range, width, height)
  })

  return (
    <Box
      component="canvas"
      ref={canvasRef}
      sx={{
        display: 'block',
        width: '100%',
        height: HEATMAP_HEIGHT,
        flex: '0 0 auto',
        pointerEvents: 'none',
        borderRadius: 0.5,
      }}
    />
  )
}
