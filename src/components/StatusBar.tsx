import Box from '@mui/material/Box'
import CircularProgress from '@mui/material/CircularProgress'
import Typography from '@mui/material/Typography'

type StatusBarProps = {
  fileName: string | null
  loadingName: string | null
}

export default function StatusBar({ fileName, loadingName }: StatusBarProps) {
  return (
    <Box
      component="footer"
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        flex: '0 0 auto',
        minHeight: 24,
        px: 1.5,
        borderTop: 1,
        borderColor: 'divider',
        bgcolor: 'background.paper',
      }}
    >
      {loadingName ? <CircularProgress size={12} /> : null}
      <Typography variant="caption" color="text.secondary" noWrap>
        {loadingName ?? fileName ?? ''}
      </Typography>
    </Box>
  )
}
