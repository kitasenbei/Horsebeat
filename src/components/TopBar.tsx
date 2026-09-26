import AppBar from '@mui/material/AppBar'
import Box from '@mui/material/Box'
import Toolbar from '@mui/material/Toolbar'
import Button from '@mui/material/Button'
import ButtonGroup from '@mui/material/ButtonGroup'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Tooltip from '@mui/material/Tooltip'
import FolderOpenIcon from '@mui/icons-material/FolderOpen'
import UndoIcon from '@mui/icons-material/Undo'
import RedoIcon from '@mui/icons-material/Redo'
import ViewHeadlineIcon from '@mui/icons-material/ViewHeadline'
import CenterFocusStrongIcon from '@mui/icons-material/CenterFocusStrong'
import { MINT_DIM, WELL } from '../theme'

type TopBarProps = {
  onOpen: () => void
  compiled: boolean
  onCompiledChange: (compiled: boolean) => void
  follow: boolean
  onFollowChange: (follow: boolean) => void
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
}

// The bar holds what is reached for while a song plays and nothing else: the
// file, history, which picture, and whether it follows. How a picture is
// drawn and how a grid is fitted live in the panels beside the rail
const BAR_HEIGHT = 32

// a group of controls: a well, its buttons flat and square, one height
const PILL = {
  borderRadius: 1.5,
  overflow: 'hidden',
  bgcolor: WELL,
  height: BAR_HEIGHT,
  display: 'flex',
  '& .MuiButtonBase-root': {
    textTransform: 'none',
    border: 0,
    borderRadius: 0,
    px: 1,
    py: 0,
    minWidth: 0,
    height: BAR_HEIGHT,
    color: 'text.primary',
    lineHeight: 1,
    fontSize: 12,
  },
}

// a pressed toggle is lit in the shell's one accent
const SELECTED = {
  '&.Mui-selected': {
    bgcolor: MINT_DIM,
    color: '#e9fff7',
    '&:hover': { bgcolor: 'rgba(79, 209, 165, 0.3)' },
  },
}

function segment(label: string, icon: React.ReactNode) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
      {icon}
      {label}
    </Box>
  )
}

export default function TopBar({
  onOpen,
  compiled,
  onCompiledChange,
  follow,
  onFollowChange,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: TopBarProps) {
  return (
    <AppBar position="static" color="default" elevation={0}>
      <Toolbar variant="dense" disableGutters sx={{ px: 1, py: 0.75, gap: 0.5, minHeight: 0 }}>
        <Button
          size="small"
          variant="contained"
          disableElevation
          startIcon={<FolderOpenIcon />}
          onClick={onOpen}
          sx={{ px: 1.25, height: BAR_HEIGHT }}
        >
          Open
        </Button>

        <ButtonGroup size="small" variant="text" color="inherit" sx={PILL}>
          <Tooltip title="Undo">
            <span>
              <Button aria-label="Undo" disabled={!canUndo} onClick={onUndo}>
                <UndoIcon fontSize="small" />
              </Button>
            </span>
          </Tooltip>
          <Tooltip title="Redo">
            <span>
              <Button aria-label="Redo" disabled={!canRedo} onClick={onRedo}>
                <RedoIcon fontSize="small" />
              </Button>
            </span>
          </Tooltip>
        </ButtonGroup>

        <Box sx={{ width: 8 }} />

        <ToggleButtonGroup
          size="small"
          exclusive
          value={compiled ? 'compiled' : null}
          onChange={() => onCompiledChange(!compiled)}
          sx={PILL}
        >
          <ToggleButton value="compiled" aria-label="Compiled view" sx={SELECTED}>
            <Tooltip title="Compiled view">
              <span>{segment('Compiled', <ViewHeadlineIcon fontSize="small" />)}</span>
            </Tooltip>
          </ToggleButton>
        </ToggleButtonGroup>

        <ToggleButtonGroup
          size="small"
          exclusive
          value={follow ? 'follow' : null}
          onChange={() => onFollowChange(!follow)}
          sx={PILL}
        >
          <ToggleButton value="follow" aria-label="Follow the playhead" sx={SELECTED}>
            <Tooltip title="Hold the playhead's column in place and move the window under it">
              <span>{segment('Follow', <CenterFocusStrongIcon fontSize="small" />)}</span>
            </Tooltip>
          </ToggleButton>
        </ToggleButtonGroup>
      </Toolbar>
    </AppBar>
  )
}
