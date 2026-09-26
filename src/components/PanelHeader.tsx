import type { ReactNode } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'

type PanelHeaderProps = {
  title: string
  children?: ReactNode
}

// The strip a panel is named by: the title in small caps on the shell colour,
// its actions on the right, the same height everywhere so the eye learns it
// once and finds the next panel by it
export const PANEL_HEADER_HEIGHT = 26

export default function PanelHeader({ title, children }: PanelHeaderProps) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        height: PANEL_HEADER_HEIGHT,
        px: 1,
        flex: '0 0 auto',
        bgcolor: 'background.default',
        borderBottom: 1,
        borderColor: 'divider',
      }}
    >
      <Typography
        variant="caption"
        sx={{
          flex: 1,
          textTransform: 'uppercase',
          letterSpacing: 0.6,
          fontSize: 10,
          fontWeight: 600,
          color: 'text.secondary',
          userSelect: 'none',
        }}
      >
        {title}
      </Typography>
      {children}
    </Box>
  )
}
