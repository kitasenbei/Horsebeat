import { createTheme } from '@mui/material/styles'

export const GRID_PURPLE = '#7b00ff'

// The workstation shell: one dark surface, panels as regions of it divided by
// hairlines, small square controls, colour kept for the data and for the one
// thing that is live. Every MUI control takes its shape from here, so a new
// panel looks like the rest without dressing
export const SHELL = '#1c1c1f'
export const PANEL = '#232327'
export const WELL = '#151517'
export const LINE = 'rgba(255, 255, 255, 0.1)'
export const LIVE = '#e07c0a'

export const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: '#2fb3a3', light: '#5ccbbd', dark: '#128476', contrastText: '#0c1211' },
    secondary: { main: '#8f9aa5', light: '#b5bec6', dark: '#5f6a75' },
    info: { main: '#8b6ff0', light: '#a992ff', dark: '#6741d9' },
    warning: { main: LIVE, light: '#f4a04a', dark: '#a85700', contrastText: '#1a0e00' },
    error: { main: '#ef5350' },
    background: { default: SHELL, paper: PANEL },
    divider: LINE,
    text: { primary: '#d8d8dc', secondary: '#9a9aa2', disabled: '#5e5e66' },
    action: { hover: 'rgba(255, 255, 255, 0.06)', selected: 'rgba(255, 255, 255, 0.12)' },
  },
  shape: { borderRadius: 3 },
  typography: {
    fontSize: 12,
    button: { textTransform: 'none', fontWeight: 500 },
    caption: { fontSize: 11, lineHeight: 1.3 },
    body2: { fontSize: 12 },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: { backgroundColor: SHELL, fontVariantNumeric: 'tabular-nums' },
      },
    },
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: { backgroundImage: 'none', border: `1px solid ${LINE}` },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: { backgroundColor: PANEL, backgroundImage: 'none', borderBottom: `1px solid ${LINE}` },
      },
    },
    MuiButton: {
      defaultProps: { size: 'small', disableElevation: true },
      styleOverrides: {
        root: { minHeight: 26, paddingTop: 2, paddingBottom: 2, lineHeight: 1.4 },
      },
    },
    MuiIconButton: {
      defaultProps: { size: 'small' },
      styleOverrides: { root: { borderRadius: 3 } },
    },
    MuiToggleButton: {
      styleOverrides: {
        root: {
          borderColor: LINE,
          color: '#c4c4ca',
          paddingTop: 3,
          paddingBottom: 3,
          paddingLeft: 8,
          paddingRight: 8,
          lineHeight: 1.4,
          fontSize: 12,
          '&.Mui-selected': { backgroundColor: 'rgba(47, 179, 163, 0.22)', color: '#e8fffb' },
          '&.Mui-selected:hover': { backgroundColor: 'rgba(47, 179, 163, 0.3)' },
        },
      },
    },
    MuiToggleButtonGroup: {
      styleOverrides: { root: { backgroundColor: WELL } },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: { backgroundColor: WELL, fontSize: 12 },
        notchedOutline: { borderColor: LINE },
        input: { paddingTop: 4, paddingBottom: 4 },
      },
    },
    MuiSelect: {
      styleOverrides: { select: { paddingTop: 4, paddingBottom: 4, minHeight: 0 } },
    },
    MuiMenu: {
      styleOverrides: { paper: { backgroundColor: PANEL } },
    },
    MuiMenuItem: {
      styleOverrides: { root: { fontSize: 12, minHeight: 28 } },
    },
    MuiChip: {
      styleOverrides: { root: { borderRadius: 3, height: 22, fontSize: 11 } },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: { backgroundColor: '#0e0e10', border: `1px solid ${LINE}`, fontSize: 11 },
      },
    },
    MuiDialog: {
      styleOverrides: { paper: { backgroundColor: PANEL } },
    },
  },
})
