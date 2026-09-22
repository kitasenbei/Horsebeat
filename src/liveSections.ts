import { sectionSignature } from './draw'
import { makeLiveStore } from './liveStore'
import type { Section } from './timing'

// The tempo sections while one of them is being dragged.
const store = makeLiveStore<Section[]>(
  (left, right) => sectionSignature(left) === sectionSignature(right),
)

export const liveSections = store.read
export const useLiveSectionsValue = store.useValue
export const useLiveSectionsEdit = store.useEdit
