import { makeLiveStore } from './liveStore'

// How many seconds the approach view shows, while the wheel or the pill is
// turning it. The value is kept as a speed, the range less the seconds, so a
// larger figure is a closer view; the pill and the wheel both turn it here,
// the approach view and the pill both read it here, and the app hears once
// when the turning stops
export const FALL_RANGE = 10.5
export const FALL_MIN = 0.5
export const FALL_MAX = 10
export const FALL_SETTLE_MS = 160

export function secondsOf(fallSpeed: number): number {
  return FALL_RANGE - fallSpeed
}

export function clampFall(fallSpeed: number): number {
  return Math.min(FALL_MAX, Math.max(FALL_MIN, fallSpeed))
}

const store = makeLiveStore<number>((left, right) => Math.abs(left - right) < 1e-9)

export const useLiveFallValue = store.useValue
export const useLiveFallEdit = store.useEdit
