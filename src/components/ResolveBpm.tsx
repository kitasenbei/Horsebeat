import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import CloseIcon from '@mui/icons-material/Close'
import type { Section } from '../timing'

type ResolveBpmProps = {
  latest: Section | null
  onResolve: () => void
  onExit: () => void
}

export default function ResolveBpm({ latest, onResolve, onExit }: ResolveBpmProps) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <Button size="small" variant="contained" onClick={onResolve} sx={{ textTransform: 'none' }}>
        Resolve BPM
      </Button>
      {latest ? <Chip size="small" label={`${latest.bpm.toFixed(1)} BPM`} /> : null}
      <Tooltip title="Exit marker mode">
        <IconButton
          size="small"
          aria-label="Exit marker mode"
          onClick={onExit}
          sx={{
            bgcolor: 'grey.300',
            color: 'text.primary',
            '&:hover': { bgcolor: 'grey.400' },
          }}
        >
          <CloseIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </Box>
  )
}
