import type { Range } from './range'
import { makeLiveStore } from './liveStore'

// The window while it is being dragged or zoomed.
const store = makeLiveStore<Range>(
  (left, right) => Math.abs(left.start - right.start) < 1e-9 && Math.abs(left.end - right.end) < 1e-9,
)

export const liveRange = store.read
export const useLiveRangeValue = store.useValue
export const useLiveRangeEdit = store.useEdit
