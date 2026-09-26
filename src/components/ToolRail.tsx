import Box from '@mui/material/Box'
import ToggleButton from '@mui/material/ToggleButton'
import Tooltip from '@mui/material/Tooltip'
import ViewListIcon from '@mui/icons-material/ViewList'
import ShowChartIcon from '@mui/icons-material/ShowChart'
import GridOnIcon from '@mui/icons-material/GridOn'
import SpeedIcon from '@mui/icons-material/Speed'
import { TRACING } from '../trace'

// The panels a song is worked on with, one icon each down the left edge. The
// pressed one fills the column beside the rail; pressing it again puts the
// column away and gives the picture the width. One panel at a time, so the
// column keeps one width and the picture never jumps
export type Tool = 'sections' | 'curve' | 'frames' | 'trace'

type ToolRailProps = {
  tool: Tool | null
  onToolChange: (tool: Tool | null) => void
}

const TOOLS: { tool: Tool; title: string; icon: React.ReactNode }[] = [
  { tool: 'sections', title: 'Tempo sections', icon: <ViewListIcon fontSize="medium" /> },
  { tool: 'curve', title: 'Amplitude curve', icon: <ShowChartIcon fontSize="medium" /> },
  { tool: 'frames', title: 'Beat frames', icon: <GridOnIcon fontSize="medium" /> },
  ...(TRACING ? [{ tool: 'trace' as const, title: 'Trace', icon: <SpeedIcon fontSize="medium" /> }] : []),
]

export const RAIL_WIDTH = 52

export default function ToolRail({ tool, onToolChange }: ToolRailProps) {
  return (
    <Box
      sx={{
        width: RAIL_WIDTH,
        flex: '0 0 auto',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 0.75,
        py: 0.75,
        bgcolor: 'background.paper',
        borderRadius: 1.5,
      }}
    >
      {TOOLS.map((entry) => (
        <Tooltip key={entry.tool} title={entry.title} placement="right">
          <ToggleButton
            value={entry.tool}
            selected={tool === entry.tool}
            onChange={() => onToolChange(tool === entry.tool ? null : entry.tool)}
            aria-label={entry.title}
            sx={{ width: 44, height: 44, p: 0 }}
          >
            {entry.icon}
          </ToggleButton>
        </Tooltip>
      ))}
    </Box>
  )
}
