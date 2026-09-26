import { makeLiveStore } from './liveStore'
import type { Section } from './timing'

// The tempo sections while one of them is being dragged. Two lists are the
// same when every section is, in all it holds: the store lets go of a drag's
// value on the first sign the app has moved, and a change of meter or of
// which sections there are is as much a move as one of tempo
function signature(sections: Section[]): string {
  return sections
    .map((section) => `${section.id}:${section.offsetMs}:${section.bpm}:${section.meter}`)
    .join(',')
}

const store = makeLiveStore<Section[]>((left, right) => signature(left) === signature(right))

export const liveSections = store.read
export const useLiveSectionsValue = store.useValue
export const useLiveSectionsEdit = store.useEdit
export const subscribeLiveSections = store.subscribe
