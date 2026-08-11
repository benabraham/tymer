import { signal } from '@preact/signals'
import type { SoundVariant } from '../lib/sound-manifest'

// One queued item: the take itself, plus (when it's a matrix take) which
// row/voice it lives in — manifest keys are already globally unique, so a
// row key alone is enough to identify it without a bank id — so the row and
// column it belongs to can be highlighted while it sounds, regardless of
// which button started the queue.
export type PlaybackItem = {
    take: SoundVariant
    rowKey?: string
    set?: string
}

// The `src` of the take currently playing, or null when idle.
export const playingSrc = signal<string | null>(null)

// The id of the group play (row/column/cell/single-take) currently driving
// the queue, so the exact button that started it can render as active — a
// cell's own ▶ and its voice column's ▶ can both touch the same take, and
// only the one that is actually running the queue should look "active".
export const playingGroupId = signal<string | null>(null)

// Where the currently sounding take lives in the matrix — set from the
// queued item's own metadata, so it reflects reality no matter whether a
// cell, a row or a whole voice column started the queue.
export const playingLocation = signal<{ rowKey: string | null; set: string | null }>({
    rowKey: null,
    set: null,
})

// A new Set on every write (never mutated) so subscribers actually see the
// change — signals compare by reference for non-primitives.
export const heardSrcs = signal<Set<string>>(new Set())

let currentAudio: HTMLAudioElement | null = null
let queue: PlaybackItem[] = []

const markHeard = (src: string) => {
    const next = new Set(heardSrcs.value)
    next.add(src)
    heardSrcs.value = next
}

const resetPlaybackState = () => {
    playingSrc.value = null
    playingGroupId.value = null
    playingLocation.value = { rowKey: null, set: null }
}

const playItem = (item: PlaybackItem) => {
    const element = new Audio(item.take.src)
    currentAudio = element
    playingSrc.value = item.take.src
    playingLocation.value = { rowKey: item.rowKey ?? null, set: item.set ?? null }

    element.onended = () => {
        markHeard(item.take.src)
        playNext()
    }

    element.play().catch(error => {
        console.error('sound-preview: failed to play', item.take.src, error)
        playNext()
    })
}

const playNext = () => {
    const next = queue.shift()
    if (!next) {
        resetPlaybackState()
        currentAudio = null
        return
    }
    playItem(next)
}

// Stops whatever is playing and empties the queue — starting a new play
// implicitly cancels the previous one by calling this first.
export const stopPlayback = () => {
    if (currentAudio) {
        currentAudio.onended = null
        currentAudio.pause()
        currentAudio = null
    }
    queue = []
    resetPlaybackState()
}

export const playQueue = ({ items, groupId }: { items: PlaybackItem[]; groupId: string }) => {
    stopPlayback()
    if (items.length === 0) return
    const [first, ...rest] = items
    queue = rest
    playingGroupId.value = groupId
    playItem(first)
}

export const playOne = (item: PlaybackItem) => {
    playQueue({ items: [item], groupId: item.take.src })
}

export const clearHeard = () => {
    heardSrcs.value = new Set()
}
