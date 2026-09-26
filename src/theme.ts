import { createTheme } from '@mui/material/styles'

export const GRID_PURPLE = '#7b00ff'

// The shell in three tones of one green black, and nothing else: the shell
// behind everything, a panel a step lighter, a row or a well a step from
// that. Edges are where two tones meet, so there are no lines in the chrome;
// gaps do the separating. The one accent is a mint that fills, for a value
// and for the thing that is on. Colour otherwise belongs to the data, drawn
// on its own dark neutral so the maps stay true.
//
// The tones can be taken from a picture instead, so the shell wears the
// user's own colours: the components style themselves through variables on
// the root, and the theme is rebuilt from the same values, so one change of
// tones reaches every well, pill and pressed toggle at once
export type Tones = {
  shell: string
  panel: string
  row: string
  well: string
  mint: string
}

export const DEFAULT_TONES: Tones = {
  shell: '#121918',
  panel: '#1a2321',
  row: '#232e2c',
  well: '#0f1514',
  mint: '#4fd1a5',
}

// what the components ask for: the variables, so a change of tones is a
// change of style and not a render
export const SHELL = 'var(--hb-shell)'
export const PANEL = 'var(--hb-panel)'
export const ROW = 'var(--hb-row)'
export const WELL = 'var(--hb-well)'
export const MINT = 'var(--hb-mint)'
export const MINT_DIM = 'color-mix(in srgb, var(--hb-mint) 22%, transparent)'
// the picture's own neutral stays whatever the tones, so the maps stay true
export const CANVAS = '#121316'
export const LINE = 'rgba(255, 255, 255, 0.08)'
export const LIVE = '#e07c0a'

let held: Tones = DEFAULT_TONES

// the tones as they stand, for a canvas that cannot read a variable
export function currentTones(): Tones {
  return held
}

export function applyTones(tones: Tones) {
  held = tones
  const root = document.documentElement.style
  root.setProperty('--hb-shell', tones.shell)
  root.setProperty('--hb-panel', tones.panel)
  root.setProperty('--hb-row', tones.row)
  root.setProperty('--hb-well', tones.well)
  root.setProperty('--hb-mint', tones.mint)
}

function withAlpha(hex: string, alpha: number): string {
  const value = Number.parseInt(hex.slice(1), 16)
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`
}

export function makeTheme(tones: Tones) {
  const mintDim = withAlpha(tones.mint, 0.22)
  const mintPressed = withAlpha(tones.mint, 0.3)
  return createTheme({

  palette: {
    mode: 'dark',
    primary: { main: tones.mint, light: '#7fe0c0', dark: '#2fa17c', contrastText: '#08110e' },
    secondary: { main: '#8fa39d', light: '#b3c4be', dark: '#5f716c' },
    info: { main: '#8b6ff0', light: '#a992ff', dark: '#6741d9' },
    warning: { main: LIVE, light: '#f4a04a', dark: '#a85700', contrastText: '#1a0e00' },
    error: { main: '#ef5350' },
    background: { default: tones.shell, paper: tones.panel },
    divider: LINE,
    text: { primary: '#dfe6e3', secondary: '#93a49e', disabled: '#56655f' },
    action: { hover: 'rgba(255, 255, 255, 0.05)', selected: mintDim },
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
          '&.Mui-selected': { backgroundColor: mintDim, color: '#e9fff7' },
          '&.Mui-selected:hover': { backgroundColor: mintPressed },
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
}

export const theme = makeTheme(DEFAULT_TONES)
applyTones(DEFAULT_TONES)
