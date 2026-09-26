import type { ReactNode } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'

type PanelHeaderProps = {
  title: string
  children?: ReactNode
}

// A panel is named, not boxed: its title with a short mint rule beneath, its
// actions to the right, and a gap before what it holds. The same in every
// panel, so the eye learns it once
export const PANEL_HEADER_HEIGHT = 32

export default function PanelHeader({ title, children }: PanelHeaderProps) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        height: PANEL_HEADER_HEIGHT,
        px: 1.25,
        flex: '0 0 auto',
      }}
    >
      <Typography
        variant="body2"
        sx={{
          flex: 1,
          fontWeight: 600,
          color: 'text.primary',
          userSelect: 'none',
          position: 'relative',
          alignSelf: 'stretch',
          display: 'flex',
          alignItems: 'center',
          '&::after': {
            content: '""',
            position: 'absolute',
            left: 0,
            bottom: 4,
            width: 28,
            height: 2,
            borderRadius: 1,
            bgcolor: 'primary.main',
          },
        }}
      >
        {title}
      </Typography>
      {children}
    </Box>
  )
}
