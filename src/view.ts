export type ViewMode = 'bars' | 'outline' | 'amplitude'

export const VIEW_MODES: { mode: ViewMode; label: string }[] = [
  { mode: 'amplitude', label: 'Amplitude' },
  { mode: 'bars', label: 'Bars' },
  { mode: 'outline', label: 'Waveform' },
]
