import { describe, it, expect } from 'vitest'
import { getNextMultipleOf3Delta } from './snap'

const min = m => m * 60 * 1000

describe('getNextMultipleOf3Delta up direction', () => {
    it.each([
        [0, 3],
        [1, 3],
        [2, 3],
        [3, 6],
        [6, 9],
    ])('snaps %i min up to %i min (exact minutes)', (fromMin, toMin) => {
        const currentMs = min(fromMin)
        const delta = getNextMultipleOf3Delta({ currentMs, direction: 'up' })
        expect(currentMs + delta).toBe(min(toMin))
    })

    it.each([
        [min(3) + 30 * 1000, min(6)],
        [min(3) + 59 * 1000, min(6)],
        [min(6) + 30 * 1000, min(9)],
        [30 * 1000, min(3)],
    ])('snaps %i ms up to %i ms (sub-minute remainder)', (currentMs, expectedMs) => {
        const delta = getNextMultipleOf3Delta({ currentMs, direction: 'up' })
        expect(currentMs + delta).toBe(expectedMs)
    })
})

describe('getNextMultipleOf3Delta down direction', () => {
    it.each([
        [min(3) + 30 * 1000, min(3)],
        [min(3) + 59 * 1000, min(3)],
        [min(6) + 30 * 1000, min(6)],
        [min(6) + 45 * 1000, min(6)],
    ])(
        'snaps %i ms down to %i ms (sub-minute remainder past a boundary)',
        (currentMs, expectedMs) => {
            const delta = getNextMultipleOf3Delta({ currentMs, direction: 'down' })
            expect(currentMs + delta).toBe(expectedMs)
        },
    )

    it.each([
        [min(7) + 30 * 1000, min(6)],
        [min(5), min(3)],
        [min(4), min(3)],
    ])('snaps %i ms down to %i ms (already correct, non-boundary)', (currentMs, expectedMs) => {
        const delta = getNextMultipleOf3Delta({ currentMs, direction: 'down' })
        expect(currentMs + delta).toBe(expectedMs)
    })

    it.each([
        [min(6), min(3)],
        [min(3), min(0)],
    ])(
        'steps a full 3 min down from an exact boundary: %i ms to %i ms',
        (currentMs, expectedMs) => {
            const delta = getNextMultipleOf3Delta({ currentMs, direction: 'down' })
            expect(currentMs + delta).toBe(expectedMs)
        },
    )

    it('returns delta -30000 for 0:30 down to 0:00', () => {
        const delta = getNextMultipleOf3Delta({ currentMs: 30 * 1000, direction: 'down' })
        expect(delta).toBe(-30000)
    })

    it('returns an unclamped negative delta -180000 for 0:00 exact down', () => {
        const delta = getNextMultipleOf3Delta({ currentMs: 0, direction: 'down' })
        expect(delta).toBe(-180000)
    })
})
