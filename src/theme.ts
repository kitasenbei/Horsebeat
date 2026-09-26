import { createTheme } from '@mui/material/styles'

export const GRID_PURPLE = '#7b00ff'

// The shell in three tones of one green black, and nothing else: the shell
// behind everything, a panel a step lighter, a row or a well a step from
// that. Edges are where two tones meet, so there are no lines in the chrome;
// gaps do the separating. The one accent is a mint that fills, for a value
// and for the thing that is on. Colour otherwise belongs to the data, drawn
// on its own dark neutral so the maps stay true
export const SHELL = '#121918'
export const PANEL = '#1a2321'
export const ROW = '#232e2c'
export const WELL = '#0f1514'
export const CANVAS = '#121316'
export const LINE = 'rgba(255, 255, 255, 0.08)'
export const MINT = '#4fd1a5'
export const MINT_DIM = 'rgba(79, 209, 165, 0.22)'
export const LIVE = '#e07c0a'

export const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: MINT, light: '#7fe0c0', dark: '#2fa17c', contrastText: '#08110e' },
    secondary: { main: '#8fa39d', light: '#b3c4be', dark: '#5f716c' },
    info: { main: '#8b6ff0', light: '#a992ff', dark: '#6741d9' },
    warning: { main: LIVE, light: '#f4a04a', dark: '#a85700', contrastText: '#1a0e00' },
    error: { main: '#ef5350' },
    background: { default: SHELL, paper: PANEL },
    divider: LINE,
    text: { primary: '#dfe6e3', secondary: '#93a49e', disabled: '#56655f' },
    action: { hover: 'rgba(255, 255, 255, 0.05)', selected: MINT_DIM },
  },
  shape: { borderRadius: 6 },
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
      styleOverrides: { root: { backgroundImage: 'none' } },
    },
    MuiAppBar: {
      styleOverrides: { root: { backgroundColor: PANEL, backgroundImage: 'none' } },
    },
    MuiButton: {
      defaultProps: { size: 'small', disableElevation: true },
      styleOverrides: {
        root: { minHeight: 28, paddingTop: 3, paddingBottom: 3, lineHeight: 1.4, borderRadius: 6 },
      },
    },
    MuiIconButton: {
      defaultProps: { size: 'small' },
      styleOverrides: { root: { borderRadius: 6 } },
    },
    MuiToggleButton: {
      styleOverrides: {
        root: {
          border: 0,
          borderRadius: 6,
          color: '#c9d3cf',
          paddingTop: 4,
          paddingBottom: 4,
          paddingLeft: 10,
          paddingRight: 10,
          lineHeight: 1.4,
          fontSize: 12,
          '&.Mui-selected': { backgroundColor: MINT_DIM, color: '#e9fff7' },
          '&.Mui-selected:hover': { backgroundColor: 'rgba(79, 209, 165, 0.3)' },
        },
      },
    },
    MuiToggleButtonGroup: {
      styleOverrides: {
        root: { backgroundColor: WELL, borderRadius: 6 },
        grouped: { border: 0, '&:not(:first-of-type)': { borderRadius: 6, marginLeft: 0 }, '&:first-of-type': { borderRadius: 6 } },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: { backgroundColor: WELL, fontSize: 12, borderRadius: 6 },
        notchedOutline: { border: 0 },
        input: { paddingTop: 4, paddingBottom: 4 },
      },
    },
    MuiSelect: {
      styleOverrides: { select: { paddingTop: 4, paddingBottom: 4, minHeight: 0 } },
    },
    MuiMenu: {
      styleOverrides: { paper: { backgroundColor: ROW } },
    },
    MuiMenuItem: {
      styleOverrides: { root: { fontSize: 12, minHeight: 28 } },
    },
    MuiChip: {
      styleOverrides: { root: { borderRadius: 6, height: 22, fontSize: 11 } },
    },
    MuiTooltip: {
      styleOverrides: { tooltip: { backgroundColor: '#0b100f', fontSize: 11 } },
    },
    MuiDialog: {
      styleOverrides: { paper: { backgroundColor: PANEL } },
    },
    MuiDivider: {
      styleOverrides: { root: { borderColor: LINE } },
    },
  },
})
