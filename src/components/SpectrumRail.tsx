import Box from '@mui/material/Box'
import { drawBands } from '../draw'
import { useCanvas } from '../useCanvas'
import type { Range } from '../range'

type SpectrumRailProps = {
  bands: Float32Array | null
  range: Range
}

export const SPECTRUM_HEIGHT = 36

export default function SpectrumRail({ bands, range }: SpectrumRailProps) {
  const canvasRef = useCanvas((context, width, height) => {
    if (!bands) return
    drawBands(context, bands, range, width, height)
  })

  return (
    <Box
      component="canvas"
      ref={canvasRef}
      sx={{
        display: 'block',
        width: '100%',
        height: SPECTRUM_HEIGHT,
        flex: '0 0 auto',
        pointerEvents: 'none',
        borderRadius: 0.5,
      }}
    />
  )
}
