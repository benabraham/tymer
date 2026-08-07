import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PeriodData } from '../../../lib/period.js'
import {
    calculateEndTimes,
    calculateStartTime,
    calculateTimelineMinutes,
} from './timeline-logic.js'

const MIN = 60 * 1000

const period = (duration: number, elapsed = 0): PeriodData => ({
    config: { type: 'work', note: '', userIntendedDuration: duration },
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

describe('calculateTimelineMinutes', () => {
    const START = new Date(2024, 0, 2, 12, 0, 0).getTime()

    it('is the periods total when no deadlines are set', () => {
        expect(calculateTimelineMinutes({ durationMs: 48 * MIN, sessionStart: START })).toBe(48)
    })

    it('ignores deadlines at or before the session end', () => {
        const minutes = calculateTimelineMinutes({
            durationMs: 48 * MIN,
            sessionStart: START,
            deadlineTimestamps: [START + 30 * MIN, START + 48 * MIN],
        })
        expect(minutes).toBe(48)
    })

    it('extends up to the latest deadline beyond the end', () => {
        const minutes = calculateTimelineMinutes({
            durationMs: 48 * MIN,
            sessionStart: START,
            deadlineTimestamps: [START + 60 * MIN, START + 90 * MIN],
        })
        expect(minutes).toBe(90)
    })

    it('rounds a fractional tail up so the marker stays inside the grid', () => {
        const minutes = calculateTimelineMinutes({
            durationMs: 48 * MIN,
            sessionStart: START,
            deadlineTimestamps: [START + 48 * MIN + 90 * 1000],
        })
        expect(minutes).toBe(50)
    })
})
