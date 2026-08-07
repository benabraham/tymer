import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Keep the alarm loop from touching Howler in jsdom — the loop's behavior is
// asserted through the deadlineAlarmActive signal, not through audio.
vi.mock('./sounds', () => ({
    pickRandomNotificationKey: vi.fn(() => 'notification_1'),
    playNotification: vi.fn(() => Promise.resolve(false)),
}))

import {
    applyDeadlinesFromText,
    type Deadline,
    deadlineAlarmActive,
    deadlineAlarmTimestamp,
    deadlineDayMarker,
    deadlineNow,
    deadlineOccurrences,
    deadlines,
    nearestDeadlineAfter,
    resolveParsedDeadline,
    serializeDeadlineLines,
    setDeadlines,
    silenceDeadlineAlarm,
    silencedDeadlines,
} from './deadline'

// A fixed reference: Wed 2026-08-05 12:00 local time.
const REF = new Date(2026, 7, 5, 12, 0, 0, 0).getTime()
const at = (day: number, hours: number, minutes: number): number =>
    new Date(2026, 7, day, hours, minutes, 0, 0).getTime()

const reset = (): void => {
    deadlines.value = []
    silencedDeadlines.value = []
    deadlineNow.value = REF
}

beforeEach(reset)
afterEach(reset)

describe('resolveParsedDeadline', () => {
    it('resolves no day to a daily deadline', () => {
        expect(resolveParsedDeadline({ minutes: 990, day: null, label: 'x' }, REF)).toEqual({
            kind: 'daily',
            minutes: 990,
            label: 'x',
        })
    })

    it('resolves named days relative to the reference', () => {
        expect(resolveParsedDeadline({ minutes: 1020, day: 'today', label: '' }, REF)).toEqual({
            kind: 'absolute',
            timestamp: at(5, 17, 0),
            label: '',
        })
        expect(resolveParsedDeadline({ minutes: 540, day: 'tomorrow', label: '' }, REF)).toEqual({
            kind: 'absolute',
            timestamp: at(6, 9, 0),
            label: '',
        })
        expect(resolveParsedDeadline({ minutes: 540, day: 'yesterday', label: '' }, REF)).toEqual({
            kind: 'absolute',
            timestamp: at(4, 9, 0),
            label: '',
        })
    })

    it('resolves an explicit day+month in the reference year', () => {
        expect(
            resolveParsedDeadline(
                { minutes: 540, day: { day: 30, monthIndex: 11 }, label: '' },
                REF,
            ),
        ).toEqual({
            kind: 'absolute',
            timestamp: new Date(2026, 11, 30, 9, 0, 0, 0).getTime(),
            label: '',
        })
    })
})

describe('deadlineOccurrences', () => {
    it('is empty with no deadlines set', () => {
        expect(deadlineOccurrences.value).toEqual([])
        expect(deadlineAlarmTimestamp.value).toBeNull()
    })

    it('uses the absolute timestamp directly', () => {
        deadlines.value = [{ kind: 'absolute', timestamp: at(5, 17, 0), label: '' }]
        expect(deadlineOccurrences.value[0].timestamp).toBe(at(5, 17, 0))
    })

    it('resolves a daily deadline to today-at-time and rolls over at midnight', () => {
        deadlines.value = [{ kind: 'daily', minutes: 17 * 60, label: '' }]
        expect(deadlineOccurrences.value[0].timestamp).toBe(at(5, 17, 0))
        deadlineNow.value = at(5, 18, 0)
        expect(deadlineAlarmTimestamp.value).toBe(at(5, 17, 0))
        // Next day: the occurrence moves to that day and is pending again.
        deadlineNow.value = at(6, 8, 0)
        expect(deadlineOccurrences.value[0].timestamp).toBe(at(6, 17, 0))
        expect(deadlineAlarmTimestamp.value).toBeNull()
    })
})

describe('alarm activation and silencing', () => {
    it('activates when a deadline passes and deactivates once silenced', () => {
        deadlines.value = [{ kind: 'absolute', timestamp: at(5, 13, 0), label: '' }]
        expect(deadlineAlarmActive.value).toBe(false)
        deadlineNow.value = at(5, 13, 0)
        expect(deadlineAlarmActive.value).toBe(true)
        silenceDeadlineAlarm()
        expect(deadlineAlarmActive.value).toBe(false)
        // Still overdue (the red light stays) — just quiet.
        expect(deadlineAlarmTimestamp.value).toBe(at(5, 13, 0))
    })

    it('re-arms a silenced daily deadline on the next day’s occurrence', () => {
        deadlines.value = [{ kind: 'daily', minutes: 13 * 60, label: '' }]
        deadlineNow.value = at(5, 13, 30)
        silenceDeadlineAlarm()
        expect(deadlineAlarmActive.value).toBe(false)
        deadlineNow.value = at(6, 13, 30)
        expect(deadlineAlarmActive.value).toBe(true)
    })

    it('starts silenced when a deadline is already overdue at set time', () => {
        // setDeadlines checks against the real clock — build "yesterday" from it.
        const yesterdayNoon = Date.now() - 24 * 60 * 60 * 1000
        setDeadlines([{ kind: 'absolute', timestamp: yesterdayNoon, label: '' }])
        deadlineNow.value = Date.now()
        expect(deadlineAlarmTimestamp.value).toBe(yesterdayNoon)
        expect(deadlineAlarmActive.value).toBe(false)
    })

    it('keeps an already-ringing alarm when a future deadline is added', () => {
        const now = Date.now()
        deadlineNow.value = now
        setDeadlines([{ kind: 'absolute', timestamp: now + 60000, label: 'a' }])
        deadlineNow.value = now + 60000
        expect(deadlineAlarmActive.value).toBe(true)
        setDeadlines([
            { kind: 'absolute', timestamp: now + 60000, label: 'a' },
            { kind: 'absolute', timestamp: now + 60 * 60000, label: 'b' },
        ])
        expect(deadlineAlarmActive.value).toBe(true)
    })
})

describe('latest expired wins', () => {
    const a: Deadline = { kind: 'absolute', timestamp: at(5, 13, 0), label: 'a' }
    const b: Deadline = { kind: 'absolute', timestamp: at(5, 14, 0), label: 'b' }

    it('hands the alarm to the later expiry and turns the earlier one off for good', () => {
        deadlines.value = [a, b]
        deadlineNow.value = at(5, 13, 0)
        expect(deadlineAlarmTimestamp.value).toBe(a.timestamp)
        expect(deadlineAlarmActive.value).toBe(true)

        deadlineNow.value = at(5, 14, 0)
        expect(deadlineAlarmTimestamp.value).toBe(b.timestamp)
        expect(deadlineAlarmActive.value).toBe(true)
        // The takeover silenced `a` permanently.
        expect(silencedDeadlines.value).toContain(a.timestamp)

        // Even if `b` is deleted, `a` must not resume hours later.
        deadlines.value = [a]
        expect(deadlineAlarmTimestamp.value).toBe(a.timestamp)
        expect(deadlineAlarmActive.value).toBe(false)
    })

    it('silencing the latest does not resurrect the earlier alarm', () => {
        deadlines.value = [a, b]
        deadlineNow.value = at(5, 14, 30)
        expect(deadlineAlarmActive.value).toBe(true)
        silenceDeadlineAlarm()
        expect(deadlineAlarmActive.value).toBe(false)
        expect(deadlineAlarmTimestamp.value).toBe(b.timestamp)
    })
})

describe('applyDeadlinesFromText', () => {
    it('sets every valid + line', () => {
        applyDeadlinesFromText('W 20\n+tomorrow 9:00 standup\n+16:30 gym', { reference: REF })
        expect(deadlines.value).toEqual([
            { kind: 'absolute', timestamp: at(6, 9, 0), label: 'standup' },
            { kind: 'daily', minutes: 990, label: 'gym' },
        ])
    })

    it('clears on absence only when the caller owns clearing', () => {
        deadlines.value = [{ kind: 'daily', minutes: 990, label: '' }]
        applyDeadlinesFromText('W 20', { reference: REF })
        expect(deadlines.value).toHaveLength(1)
        applyDeadlinesFromText('W 20', { reference: REF, clearOnAbsence: true })
        expect(deadlines.value).toEqual([])
    })

    it('keeps the current deadlines when only half-edited + lines remain', () => {
        deadlines.value = [{ kind: 'daily', minutes: 990, label: '' }]
        applyDeadlinesFromText('W 20\n+24:0', { reference: REF, clearOnAbsence: true })
        expect(deadlines.value).toEqual([{ kind: 'daily', minutes: 990, label: '' }])
    })

    it('is a no-op write when the parsed deadlines are semantically unchanged', () => {
        applyDeadlinesFromText('+16:30 gym', { reference: REF })
        const before = deadlines.value
        applyDeadlinesFromText('+16:30 gym', { reference: REF })
        expect(deadlines.value).toBe(before)
    })
})

describe('serializeDeadlineLines', () => {
    it('is empty with no deadlines set', () => {
        expect(serializeDeadlineLines(REF)).toEqual([])
    })

    it('serializes a daily deadline as a bare +h:mm', () => {
        deadlines.value = [{ kind: 'daily', minutes: 990, label: 'gym' }]
        expect(serializeDeadlineLines(REF)).toEqual(['+16:30 gym'])
    })

    it('always qualifies an absolute deadline, today included', () => {
        deadlines.value = [
            { kind: 'absolute', timestamp: at(5, 17, 0), label: '' },
            { kind: 'absolute', timestamp: at(6, 9, 0), label: 'standup' },
            { kind: 'absolute', timestamp: at(4, 9, 0), label: '' },
            {
                kind: 'absolute',
                timestamp: new Date(2026, 11, 30, 9, 0, 0, 0).getTime(),
                label: '',
            },
        ]
        expect(serializeDeadlineLines(REF)).toEqual([
            '+today 17:00',
            '+tomorrow 9:00 standup',
            '+yesterday 9:00',
            '+30 Dec 9:00',
        ])
    })

    it('round-trips: serialize → applyDeadlinesFromText resolves to the same list', () => {
        const original: Deadline[] = [
            { kind: 'absolute', timestamp: at(6, 9, 0), label: 'standup' },
            { kind: 'daily', minutes: 990, label: 'gym' },
        ]
        deadlines.value = original
        const lines = serializeDeadlineLines(REF)
        deadlines.value = []
        applyDeadlinesFromText(lines.join('\n'), { reference: REF })
        expect(deadlines.value).toEqual(original)
    })
})

describe('nearestDeadlineAfter', () => {
    it('returns the nearest occurrence strictly after the timestamp', () => {
        deadlines.value = [
            { kind: 'absolute', timestamp: at(5, 17, 0), label: '' },
            { kind: 'absolute', timestamp: at(5, 14, 0), label: '' },
        ]
        expect(nearestDeadlineAfter(at(5, 13, 0))).toBe(at(5, 14, 0))
        expect(nearestDeadlineAfter(at(5, 14, 0))).toBe(at(5, 17, 0))
        expect(nearestDeadlineAfter(at(5, 18, 0))).toBeNull()
    })

    it('resolves daily deadlines to the current day, past occurrences excluded', () => {
        deadlines.value = [{ kind: 'daily', minutes: 17 * 60, label: '' }]
        expect(nearestDeadlineAfter(REF)).toBe(at(5, 17, 0))
        // 17:00 already resolved for today — nothing lies beyond it until
        // midnight rolls the occurrence over.
        expect(nearestDeadlineAfter(at(5, 17, 0))).toBeNull()
    })

    it('returns null when no deadlines are set', () => {
        expect(nearestDeadlineAfter(REF)).toBeNull()
    })
})

describe('deadlineDayMarker', () => {
    it('marks today empty, adjacent days by name, others by date', () => {
        expect(deadlineDayMarker(at(5, 17, 0), REF)).toBe('')
        expect(deadlineDayMarker(at(6, 9, 0), REF)).toBe('tomorrow')
        expect(deadlineDayMarker(at(4, 9, 0), REF)).toBe('yesterday')
        expect(deadlineDayMarker(new Date(2026, 11, 30).getTime(), REF)).toBe('30 Dec')
    })
})
