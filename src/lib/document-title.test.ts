import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PERIOD_CONFIG } from './config'
import { BASE_TITLE, documentTitle, formatDocumentTitle } from './document-title'
import type { PeriodData } from './period.js'
import { configPanelOpen } from './period-configs'
import { Schedule } from './schedule'
import { initialState, timerState } from './timer'

const localStorageMock = {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
}
globalThis.localStorage = localStorageMock as unknown as Storage

vi.mock('./sounds', () => ({
    playSound: vi.fn(),
}))

describe('formatDocumentTitle', () => {
    it('returns the bare base when no flag is active', () => {
        expect(formatDocumentTitle({ base: 'Tymer' })).toBe('Tymer')
        expect(formatDocumentTitle({ base: 'Tymer', flags: [false, null, undefined] })).toBe('Tymer')
    })

    it('appends one bracketed suffix per active flag, in order', () => {
        expect(formatDocumentTitle({ base: 'W 5/24', flags: ['running'] })).toBe('W 5/24 [running]')
        expect(
            formatDocumentTitle({ base: 'Tymer', flags: ['running', false, 'editing durations'] }),
        ).toBe('Tymer [running] [editing durations]')
    })
})

describe('documentTitle', () => {
    beforeEach(() => {
        Schedule.reset()
        configPanelOpen.value = false
        timerState.value = {
            ...initialState,
            periods: PERIOD_CONFIG.map(({ duration, type, note = '' }): PeriodData => ({
                config: { type, note, userIntendedDuration: duration },
                state: { duration, elapsed: 0, remaining: duration },
            })),
        }
    })

    it('is the plain base title while idle', () => {
        expect(documentTitle.value).toBe(BASE_TITLE)
    })

    it('shows the period progress and the running flag while running', () => {
        Schedule.start()
        expect(documentTitle.value).toBe('W 0/24 [running]')
    })

    it('marks overtime with a stop sign', () => {
        Schedule.start()
        const periods = timerState.value.periods.map((period, index) =>
            index === 0
                ? { ...period, state: { ...period.state, elapsed: 25 * 60 * 1000 } }
                : period,
        )
        timerState.value = { ...timerState.value, periods }
        expect(documentTitle.value).toBe('W 🛑 25/24 [running]')
    })

    it('adds the editing flag while the durations panel is open', () => {
        configPanelOpen.value = true
        expect(documentTitle.value).toBe(`${BASE_TITLE} [editing durations]`)
    })
})
