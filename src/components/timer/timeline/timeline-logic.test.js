import { describe, beforeEach, afterEach, it, expect, vi } from 'vitest'
import { calculateEndTimes, calculateStartTime } from './timeline-logic'

const MIN = 60 * 1000

const period = (duration, elapsed = 0) => ({
    state: { duration, elapsed, remaining: Math.max(0, duration - elapsed) },
})

describe('calculateEndTimes', () => {
    beforeEach(() => {
        vi.useFakeTimers()
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it('idle (nothing elapsed): projects the schedule forward from now', () => {
        vi.setSystemTime(new Date(2024, 0, 1, 10, 0, 0))

        const times = calculateEndTimes({
            periods: [period(30 * MIN), period(30 * MIN)],
            currentPeriodIndex: null,
        })

        expect(times).toEqual(['10<br>30', '11<br>00'])
    })

    it('completed: keeps historical times ending at now instead of jumping to a future projection', () => {
        vi.setSystemTime(new Date(2024, 0, 1, 10, 0, 0))

        const times = calculateEndTimes({
            periods: [period(30 * MIN, 30 * MIN), period(30 * MIN, 30 * MIN)],
            currentPeriodIndex: null,
        })

        expect(times).toEqual(['09<br>30', '10<br>00'])
    })

    it('completed session finished shortly after midnight shows pre-midnight end times', () => {
        vi.setSystemTime(new Date(2024, 0, 2, 0, 15, 0))

        const times = calculateEndTimes({
            periods: [period(30 * MIN, 30 * MIN), period(30 * MIN, 30 * MIN)],
            currentPeriodIndex: null,
        })

        expect(times).toEqual(['23<br>45', '00<br>15'])
    })
})

describe('calculateStartTime', () => {
    beforeEach(() => {
        vi.useFakeTimers()
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it('start earlier today: plain HH<br>mm', () => {
        vi.setSystemTime(new Date(2024, 0, 1, 10, 0, 0))

        const startTime = calculateStartTime({ periods: [period(30 * MIN, 10 * MIN)] })

        expect(startTime).toBe('09<br>50')
    })

    it('anchor from yesterday: prefixed with "yesterday"', () => {
        vi.setSystemTime(new Date(2024, 0, 1, 10, 0, 0))

        const startTime = calculateStartTime({
            periods: [period(30 * MIN)],
            anchorMs: new Date(2023, 11, 31, 23, 0).getTime(),
        })

        expect(startTime).toBe('yesterday<br>23<br>00')
    })

    it('anchor older than one day: prefixed with a short date', () => {
        vi.setSystemTime(new Date(2024, 0, 1, 10, 0, 0))

        const startTime = calculateStartTime({
            periods: [period(30 * MIN)],
            anchorMs: new Date(2023, 11, 30, 9, 0).getTime(),
        })

        expect(startTime).toBe('30 Dec<br>09<br>00')
    })

    it('unanchored session running since yesterday also gets the marker', () => {
        vi.setSystemTime(new Date(2024, 0, 2, 0, 30, 0))

        const startTime = calculateStartTime({ periods: [period(90 * MIN, 60 * MIN)] })

        expect(startTime).toBe('yesterday<br>23<br>30')
    })
})
