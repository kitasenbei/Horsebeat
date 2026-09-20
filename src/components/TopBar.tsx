import { useState } from 'react'
import AppBar from '@mui/material/AppBar'
import Toolbar from '@mui/material/Toolbar'
import Button from '@mui/material/Button'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import CheckIcon from '@mui/icons-material/Check'
import { VIEW_MODES, type ViewMode } from '../view'
import type { EditMode } from '../mode'

type TopBarProps = {
  view: ViewMode
  mode: EditMode
  curveOpen: boolean
  timingOpen: boolean
  onOpen: () => void
  onViewChange: (view: ViewMode) => void
  onModeChange: (mode: EditMode) => void
  onClearMarkers: () => void
  onCurveOpenChange: (open: boolean) => void
  onTimingOpenChange: (open: boolean) => void
}

type Item = {
  label: string
  checked?: boolean
  onSelect?: () => void
}

export default function TopBar({
  view,
  mode,
  curveOpen,
  timingOpen,
  onOpen,
  onViewChange,
  onModeChange,
  onClearMarkers,
  onCurveOpenChange,
  onTimingOpenChange,
}: TopBarProps) {
  const [open, setOpen] = useState<string | null>(null)
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)

  const menus: { label: string; items: Item[] }[] = [
    { label: 'File', items: [{ label: 'Open', onSelect: onOpen }, { label: 'Close' }] },
    { label: 'Edit', items: [{ label: 'Undo' }, { label: 'Redo' }] },
    {
      label: 'View',
      items: VIEW_MODES.map((entry) => ({
        label: entry.label,
        checked: view === entry.mode,
        onSelect: () => onViewChange(entry.mode),
      })).concat([
        {
          label: 'Amplitude curve',
          checked: curveOpen,
          onSelect: () => onCurveOpenChange(!curveOpen),
        },
      ]),
    },
    {
      label: 'Timing',
      items: [
        {
          label: 'Marker mode',
          checked: mode === 'marker',
          onSelect: () => onModeChange(mode === 'marker' ? 'none' : 'marker'),
        },
        {
          label: 'Section mode',
          checked: mode === 'section',
          onSelect: () => onModeChange(mode === 'section' ? 'none' : 'section'),
        },
        { label: 'Clear markers', onSelect: onClearMarkers },
        {
          label: 'Tempo sections',
          checked: timingOpen,
          onSelect: () => onTimingOpenChange(!timingOpen),
        },
      ],
    },
  ]

  const close = () => {
    setOpen(null)
    setAnchor(null)
  }

  const items = menus.find((menu) => menu.label === open)?.items ?? []

  return (
    <AppBar position="static" color="default" elevation={0}>
      <Toolbar variant="dense" disableGutters sx={{ px: 1, gap: 0.5 }}>
        {menus.map((menu) => (
          <Button
            key={menu.label}
            size="small"
            color="inherit"
            sx={{ textTransform: 'none' }}
            onClick={(event) => {
              setAnchor(event.currentTarget)
              setOpen(menu.label)
            }}
          >
            {menu.label}
          </Button>
        ))}
      </Toolbar>
      <Menu
        anchorEl={anchor}
        open={open !== null}
        onClose={close}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
      >
        {items.map((item) => (
          <MenuItem
            key={item.label}
            dense
            onClick={() => {
              close()
              item.onSelect?.()
            }}
          >
            <ListItemIcon sx={{ minWidth: 28 }}>
              {item.checked ? <CheckIcon fontSize="small" /> : null}
            </ListItemIcon>
            <ListItemText>{item.label}</ListItemText>
          </MenuItem>
        ))}
      </Menu>
    </AppBar>
  )
}
