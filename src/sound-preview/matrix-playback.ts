import type { PlaybackItem } from './playback'
import type { PreviewBank } from './preview-model'

// Shared queue-building helpers for the matrix's group-play buttons — corner
// (every voice, every event), voice header (one voice, every event) and row
// (one event, every voice) all walk the same bank-order-then-row-order
// structure, so the reading order on screen matches playback order.

const cellFor = (row: PreviewBank['rows'][number], set: string) =>
    row.cells.find(cell => cell.set === set)

export const buildVoiceItems = (banks: PreviewBank[], set: string): PlaybackItem[] =>
    banks.flatMap(bank =>
        bank.rows.flatMap(row => {
            const cell = cellFor(row, set)
            if (!cell || cell.takes.length === 0) return []
            return [{ take: cell.takes[0], rowKey: row.key, set }]
        }),
    )

export const buildEverythingItems = (banks: PreviewBank[], sets: string[]): PlaybackItem[] =>
    banks.flatMap(bank =>
        bank.rows.flatMap(row =>
            sets.flatMap(set => {
                const cell = cellFor(row, set)
                if (!cell || cell.takes.length === 0) return []
                return [{ take: cell.takes[0], rowKey: row.key, set }]
            }),
        ),
    )
