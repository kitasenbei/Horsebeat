import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import CloseIcon from '@mui/icons-material/Close'

type SectionBarProps = {
  count: number
  onExit: () => void
}

export default function SectionBar({ count, onExit }: SectionBarProps) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
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
