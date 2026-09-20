import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import CloseIcon from '@mui/icons-material/Close'

type SectionBarProps = {
  count: number
  onOpenPanel: () => void
  onExit: () => void
}

export default function SectionBar({ count, onOpenPanel, onExit }: SectionBarProps) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <Button size="small" variant="contained" onClick={onOpenPanel} sx={{ textTransform: 'none' }}>
        Edit sections
      </Button>
      <Chip size="small" label={`${count} ${count === 1 ? 'section' : 'sections'}`} />
      <Tooltip title="Exit section mode">
        <IconButton
          size="small"
          aria-label="Exit section mode"
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
