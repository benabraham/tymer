import { describe, it, expect } from 'vitest'
import { Period } from './period'
import { MIN_PERIOD_MS } from './config'

// Helper to build a minimal period for tests
const makePeriod = ({
    duration = 48 * 60 * 1000,
    elapsed = 0,
    remaining = 48 * 60 * 1000,
    type = 'work',
    note = '',
    userIntendedDuration = 48 * 60 * 1000,
} = {}) => ({
    config: { type, note, userIntendedDuration },
    state: { duration, elapsed, remaining },
})

describe('Period.applyElapsed', () => {
    it('happy path: elapsed within duration → remaining computed', () => {
        const period = makePeriod({ duration: 60 * 60 * 1000 })
        const result = Period.applyElapsed(period, 20 * 60 * 1000)

        expect(result.state.elapsed).toBe(20 * 60 * 1000)
        expect(result.state.remaining).toBe(40 * 60 * 1000)
    })

    it('elapsed = 0 → remaining equals full duration', () => {
        const duration = 30 * 60 * 1000
        const period = makePeriod({ duration })
        const result = Period.applyElapsed(period, 0)

        expect(result.state.elapsed).toBe(0)
        expect(result.state.remaining).toBe(duration)
    })

    it('elapsed > duration → remaining is 0, not negative', () => {
        const duration = 48 * 60 * 1000
        const period = makePeriod({ duration })
        const result = Period.applyElapsed(period, duration + 5 * 60 * 1000)

        expect(result.state.elapsed).toBe(duration + 5 * 60 * 1000)
        expect(result.state.remaining).toBe(0)
    })

    it('input period is not mutated', () => {
        const period = makePeriod({
            duration: 60 * 60 * 1000,
            elapsed: 0,
            remaining: 60 * 60 * 1000,
        })
        const originalElapsed = period.state.elapsed
        const originalRemaining = period.state.remaining

        Period.applyElapsed(period, 20 * 60 * 1000)

        expect(period.state.elapsed).toBe(originalElapsed)
        expect(period.state.remaining).toBe(originalRemaining)
    })

    it('very large elapsed value → remaining is 0', () => {
        const duration = 48 * 60 * 1000
        const period = makePeriod({ duration })
        const result = Period.applyElapsed(period, Number.MAX_SAFE_INTEGER)

        expect(result.state.remaining).toBe(0)
    })

    it('config is preserved unchanged', () => {
        const period = makePeriod({
            type: 'break',
            note: 'coffee',
            userIntendedDuration: 12 * 60 * 1000,
            duration: 12 * 60 * 1000,
        })
        const result = Period.applyElapsed(period, 5 * 60 * 1000)

        expect(result.config).toEqual(period.config)
        expect(result.config.type).toBe('break')
        expect(result.config.note).toBe('coffee')
        expect(result.config.userIntendedDuration).toBe(12 * 60 * 1000)
    })
})

describe('Period.complete', () => {
    it('happy path: elapsed at exact minute boundary → remainder = 0, period state correct', () => {
        const period = makePeriod({
            duration: 48 * 60 * 1000,
            elapsed: 3 * 60 * 1000,
            remaining: 45 * 60 * 1000,
            userIntendedDuration: 48 * 60 * 1000,
        })

        const { period: completed, remainder } = Period.complete(period)

        expect(remainder).toBe(0)
        expect(completed.state.elapsed).toBe(3 * 60 * 1000)
        expect(completed.state.duration).toBe(3 * 60 * 1000)
        expect(completed.state.remaining).toBe(0)
        expect(completed.config.userIntendedDuration).toBe(3 * 60 * 1000)
    })

    it('elapsed mid-minute (1m 15s) → remainder = 15s, duration/elapsed = 1m', () => {
        const period = makePeriod({
            duration: 48 * 60 * 1000,
            elapsed: 75 * 1000, // 1m 15s
            remaining: 0,
            userIntendedDuration: 48 * 60 * 1000,
        })

        const { period: completed, remainder } = Period.complete(period)

        expect(remainder).toBe(15 * 1000)
        expect(completed.state.elapsed).toBe(60 * 1000)
        expect(completed.state.duration).toBe(60 * 1000)
        expect(completed.state.remaining).toBe(0)
        expect(completed.config.userIntendedDuration).toBe(60 * 1000)
    })

    it('elapsed at 0 → snaps up to MIN_PERIOD_MS, remainder is negative', () => {
        const period = makePeriod({
            duration: 48 * 60 * 1000,
            elapsed: 0,
            remaining: 48 * 60 * 1000,
            userIntendedDuration: 48 * 60 * 1000,
        })

        const { period: completed, remainder } = Period.complete(period)

        // Snap up to 1 minute so no past period is ever shorter than the floor.
        // Negative remainder pushes the next period's start forward to pay back
        // the time credited to the past period.
        expect(remainder).toBe(-MIN_PERIOD_MS)
        expect(completed.state.elapsed).toBe(MIN_PERIOD_MS)
        expect(completed.state.duration).toBe(MIN_PERIOD_MS)
        expect(completed.state.remaining).toBe(0)
        expect(completed.config.userIntendedDuration).toBe(MIN_PERIOD_MS)
    })

    it('elapsed sub-minute (30s) → snaps up to MIN_PERIOD_MS, remainder = elapsed - MIN_PERIOD_MS', () => {
        const period = makePeriod({
            duration: 48 * 60 * 1000,
            elapsed: 30 * 1000,
            remaining: 48 * 60 * 1000 - 30 * 1000,
            userIntendedDuration: 48 * 60 * 1000,
        })

        const { period: completed, remainder } = Period.complete(period)

        expect(remainder).toBe(30 * 1000 - MIN_PERIOD_MS)
        expect(completed.state.elapsed).toBe(MIN_PERIOD_MS)
        expect(completed.state.duration).toBe(MIN_PERIOD_MS)
        expect(completed.state.remaining).toBe(0)
        expect(completed.config.userIntendedDuration).toBe(MIN_PERIOD_MS)
    })

    it('config.userIntendedDuration is updated to the rounded-down value', () => {
        const period = makePeriod({
            duration: 48 * 60 * 1000,
            elapsed: 119 * 1000, // 1m 59s → rounds down to 1m
            remaining: 0,
            userIntendedDuration: 48 * 60 * 1000,
        })

        const { period: completed } = Period.complete(period)

        expect(completed.config.userIntendedDuration).toBe(60 * 1000)
    })

    it('input is not mutated', () => {
        const period = makePeriod({
            duration: 48 * 60 * 1000,
            elapsed: 75 * 1000,
            remaining: 0,
            userIntendedDuration: 48 * 60 * 1000,
        })
        const originalElapsed = period.state.elapsed
        const originalDuration = period.state.duration

        Period.complete(period)

        expect(period.state.elapsed).toBe(originalElapsed)
        expect(period.state.duration).toBe(originalDuration)
    })

    it('config preserved otherwise (type, note unchanged)', () => {
        const period = makePeriod({
            type: 'break',
            note: 'coffee',
            duration: 12 * 60 * 1000,
            elapsed: 7 * 60 * 1000,
            remaining: 5 * 60 * 1000,
            userIntendedDuration: 12 * 60 * 1000,
        })

        const { period: completed } = Period.complete(period)

        expect(completed.config.type).toBe('break')
        expect(completed.config.note).toBe('coffee')
    })
})

describe('Period.autoExtendDuration', () => {
    it('positive delta → duration grows', () => {
        const duration = 48 * 60 * 1000
        const delta = 12 * 60 * 1000
        const period = makePeriod({ duration })
        const result = Period.autoExtendDuration(period, delta)

        expect(result.state.duration).toBe(duration + delta)
    })

    it('userIntendedDuration is never touched', () => {
        const userIntendedDuration = 48 * 60 * 1000
        const period = makePeriod({ userIntendedDuration, duration: userIntendedDuration })
        const result = Period.autoExtendDuration(period, 12 * 60 * 1000)

        expect(result.config.userIntendedDuration).toBe(userIntendedDuration)
    })

    it('input period is not mutated', () => {
        const duration = 48 * 60 * 1000
        const period = makePeriod({ duration })

        Period.autoExtendDuration(period, 5 * 60 * 1000)

        expect(period.state.duration).toBe(duration)
    })

    it('elapsed is unchanged; remaining is recomputed against new duration', () => {
        const elapsed = 50 * 60 * 1000
        const period = makePeriod({ duration: 48 * 60 * 1000, elapsed, remaining: 0 })
        const result = Period.autoExtendDuration(period, 12 * 60 * 1000)

        // 48 + 12 = 60 vs elapsed 50 → 60 wins
        expect(result.state.elapsed).toBe(elapsed)
        expect(result.state.duration).toBe(60 * 60 * 1000)
        expect(result.state.remaining).toBe(10 * 60 * 1000)
    })

    it('zero delta and elapsed <= duration → period unchanged', () => {
        const period = makePeriod({ duration: 48 * 60 * 1000, elapsed: 0 })
        const result = Period.autoExtendDuration(period, 0)

        expect(result.state.duration).toBe(period.state.duration)
        expect(result.state.remaining).toBe(period.state.remaining)
        expect(result.config).toEqual(period.config)
    })

    it('negative delta → duration shrinks when elapsed allows it', () => {
        const duration = 48 * 60 * 1000
        const period = makePeriod({ duration })
        const result = Period.autoExtendDuration(period, -6 * 60 * 1000)

        expect(result.state.duration).toBe(duration - 6 * 60 * 1000)
    })

    it('elapsed > duration + delta → duration jumps to elapsed (no overshoot)', () => {
        // Reproduces a regression where elapsed could outpace duration during
        // catch-up after a backgrounded tab or after the user pushed elapsed
        // forward, causing the elapsed bar to visually overflow the period.
        const period = makePeriod({
            duration: 200 * 60 * 1000,
            elapsed: 243 * 60 * 1000,
        })
        const result = Period.autoExtendDuration(period, 60 * 1000)

        expect(result.state.duration).toBe(243 * 60 * 1000)
        expect(result.state.remaining).toBe(0)
    })

    it('elapsed below duration + delta → normal +delta extension wins', () => {
        const duration = 48 * 60 * 1000
        const period = makePeriod({ duration, elapsed: 48 * 60 * 1000 })
        const result = Period.autoExtendDuration(period, 60 * 1000)

        expect(result.state.duration).toBe(48 * 60 * 1000 + 60 * 1000)
    })
})

describe('Period.extendDuration', () => {
    it('positive delta → both duration and userIntendedDuration grow by delta; remaining recomputed', () => {
        const elapsed = 10 * 60 * 1000
        const duration = 48 * 60 * 1000
        const delta = 6 * 60 * 1000
        const period = makePeriod({ duration, elapsed, remaining: duration - elapsed })
        const result = Period.extendDuration(period, delta)

        expect(result.state.duration).toBe(duration + delta)
        expect(result.config.userIntendedDuration).toBe(duration + delta)
        expect(result.state.remaining).toBe(duration + delta - elapsed)
    })

    it('negative delta when elapsed allows it → duration and userIntendedDuration shrink by delta', () => {
        const elapsed = 10 * 60 * 1000
        const duration = 48 * 60 * 1000
        const delta = -6 * 60 * 1000
        const period = makePeriod({ duration, elapsed, remaining: duration - elapsed })
        const result = Period.extendDuration(period, delta)

        expect(result.state.duration).toBe(duration + delta)
        expect(result.config.userIntendedDuration).toBe(duration + delta)
        expect(result.state.remaining).toBe(duration + delta - elapsed)
    })

    it('negative delta that would underflow elapsed → duration floors at elapsed; userIntendedDuration follows', () => {
        const elapsed = 40 * 60 * 1000
        const duration = 48 * 60 * 1000
        const delta = -30 * 60 * 1000 // would make duration = 18min, below elapsed 40min
        const period = makePeriod({ duration, elapsed, remaining: duration - elapsed })
        const result = Period.extendDuration(period, delta)

        expect(result.state.duration).toBe(elapsed)
        expect(result.config.userIntendedDuration).toBe(elapsed)
        expect(result.state.remaining).toBe(0)
    })

    it('zero delta → duration and remaining unchanged, state and config consistent', () => {
        const elapsed = 10 * 60 * 1000
        const duration = 48 * 60 * 1000
        const period = makePeriod({ duration, elapsed, remaining: duration - elapsed })
        const result = Period.extendDuration(period, 0)

        expect(result.state.duration).toBe(duration)
        expect(result.config.userIntendedDuration).toBe(duration)
        expect(result.state.remaining).toBe(duration - elapsed)
    })

    it('input period is not mutated', () => {
        const period = makePeriod({ duration: 48 * 60 * 1000, elapsed: 10 * 60 * 1000 })
        const originalDuration = period.state.duration
        const originalUserIntended = period.config.userIntendedDuration

        Period.extendDuration(period, 6 * 60 * 1000)

        expect(period.state.duration).toBe(originalDuration)
        expect(period.config.userIntendedDuration).toBe(originalUserIntended)
    })

    it('config.type and config.note are preserved', () => {
        const period = makePeriod({
            type: 'break',
            note: 'coffee',
            duration: 12 * 60 * 1000,
            elapsed: 3 * 60 * 1000,
            userIntendedDuration: 12 * 60 * 1000,
        })
        const result = Period.extendDuration(period, 6 * 60 * 1000)

        expect(result.config.type).toBe('break')
        expect(result.config.note).toBe('coffee')
    })

    it('negative delta on small unstarted period → floors at MIN_PERIOD_MS, not at 0', () => {
        const period = makePeriod({
            duration: 2 * 60 * 1000,
            elapsed: 0,
            remaining: 2 * 60 * 1000,
            userIntendedDuration: 2 * 60 * 1000,
        })
        const result = Period.extendDuration(period, -5 * 60 * 1000)

        expect(result.state.duration).toBe(MIN_PERIOD_MS)
        expect(result.config.userIntendedDuration).toBe(MIN_PERIOD_MS)
        expect(result.state.remaining).toBe(MIN_PERIOD_MS)
    })
})

describe('Period.absorbAsCompleted', () => {
    it('happy path: duration and elapsed both grow by extraMs', () => {
        const period = makePeriod({
            duration: 48 * 60 * 1000,
            elapsed: 48 * 60 * 1000,
            remaining: 0,
        })
        const extraMs = 5 * 60 * 1000
        const result = Period.absorbAsCompleted(period, extraMs)

        expect(result.state.duration).toBe(48 * 60 * 1000 + extraMs)
        expect(result.state.elapsed).toBe(48 * 60 * 1000 + extraMs)
    })

    it('state.remaining stays 0', () => {
        const period = makePeriod({
            duration: 48 * 60 * 1000,
            elapsed: 48 * 60 * 1000,
            remaining: 0,
        })
        const result = Period.absorbAsCompleted(period, 3 * 60 * 1000)

        expect(result.state.remaining).toBe(0)
    })

    it('input period is not mutated', () => {
        const period = makePeriod({
            duration: 48 * 60 * 1000,
            elapsed: 48 * 60 * 1000,
            remaining: 0,
        })
        const originalDuration = period.state.duration
        const originalElapsed = period.state.elapsed

        Period.absorbAsCompleted(period, 5 * 60 * 1000)

        expect(period.state.duration).toBe(originalDuration)
        expect(period.state.elapsed).toBe(originalElapsed)
    })

    it('zero extraMs → duration and elapsed unchanged', () => {
        const period = makePeriod({
            duration: 48 * 60 * 1000,
            elapsed: 48 * 60 * 1000,
            remaining: 0,
        })
        const result = Period.absorbAsCompleted(period, 0)

        expect(result.state.duration).toBe(period.state.duration)
        expect(result.state.elapsed).toBe(period.state.elapsed)
    })

    it('config including userIntendedDuration is not touched', () => {
        const period = makePeriod({
            type: 'work',
            note: 'deep work',
            userIntendedDuration: 48 * 60 * 1000,
            duration: 48 * 60 * 1000,
            elapsed: 48 * 60 * 1000,
            remaining: 0,
        })
        const result = Period.absorbAsCompleted(period, 10 * 60 * 1000)

        expect(result.config.userIntendedDuration).toBe(48 * 60 * 1000)
        expect(result.config.type).toBe('work')
        expect(result.config.note).toBe('deep work')
    })
})

describe('Period.create', () => {
    it('happy path: returns valid Period with full duration, zero elapsed, full remaining', () => {
        const durationMs = 48 * 60 * 1000
        const result = Period.create({ type: 'work', note: '', durationMs })

        expect(result.state.duration).toBe(durationMs)
        expect(result.state.elapsed).toBe(0)
        expect(result.state.remaining).toBe(durationMs)
        expect(result.state.finished).toBeUndefined()
    })

    it('config has type, note, userIntendedDuration set correctly', () => {
        const durationMs = 24 * 60 * 1000
        const result = Period.create({ type: 'break', note: 'coffee', durationMs })

        expect(result.config.type).toBe('break')
        expect(result.config.note).toBe('coffee')
        expect(result.config.userIntendedDuration).toBe(durationMs)
    })

    it('userIntendedDuration equals durationMs', () => {
        const durationMs = 12 * 60 * 1000
        const result = Period.create({ type: 'fun', note: '', durationMs })

        expect(result.config.userIntendedDuration).toBe(durationMs)
        expect(result.state.duration).toBe(durationMs)
    })

    it('durationMs below MIN_PERIOD_MS → clamped to MIN_PERIOD_MS', () => {
        const result = Period.create({ type: 'work', note: '', durationMs: 30 * 1000 })

        expect(result.state.duration).toBe(MIN_PERIOD_MS)
        expect(result.state.remaining).toBe(MIN_PERIOD_MS)
        expect(result.config.userIntendedDuration).toBe(MIN_PERIOD_MS)
    })
})

describe('Period.unstarted', () => {
    const makeConfig = ({
        type = 'work',
        note = '',
        userIntendedDuration = 48 * 60 * 1000,
    } = {}) => ({
        type,
        note,
        userIntendedDuration,
    })

    it('returns a Period with the same config preserved', () => {
        const config = makeConfig({
            type: 'break',
            note: 'coffee',
            userIntendedDuration: 12 * 60 * 1000,
        })
        const result = Period.unstarted(config)

        expect(result.config).toEqual(config)
    })

    it('state.duration equals config.userIntendedDuration', () => {
        const config = makeConfig({ userIntendedDuration: 30 * 60 * 1000 })
        const result = Period.unstarted(config)

        expect(result.state.duration).toBe(config.userIntendedDuration)
    })

    it('state.elapsed = 0', () => {
        const config = makeConfig()
        const result = Period.unstarted(config)

        expect(result.state.elapsed).toBe(0)
    })

    it('state.remaining = config.userIntendedDuration', () => {
        const config = makeConfig({ userIntendedDuration: 20 * 60 * 1000 })
        const result = Period.unstarted(config)

        expect(result.state.remaining).toBe(config.userIntendedDuration)
    })

    it('state.finished is not present (lifecycle is position-based)', () => {
        const config = makeConfig()
        const result = Period.unstarted(config)

        expect(result.state.finished).toBeUndefined()
    })

    it('input config is not mutated', () => {
        const config = makeConfig({ userIntendedDuration: 48 * 60 * 1000 })
        const originalDuration = config.userIntendedDuration

        Period.unstarted(config)

        expect(config.userIntendedDuration).toBe(originalDuration)
    })

    it('userIntendedDuration below MIN_PERIOD_MS → clamped to MIN_PERIOD_MS', () => {
        const config = makeConfig({ userIntendedDuration: 30 * 1000 })
        const result = Period.unstarted(config)

        expect(result.state.duration).toBe(MIN_PERIOD_MS)
        expect(result.state.remaining).toBe(MIN_PERIOD_MS)
        expect(result.config.userIntendedDuration).toBe(MIN_PERIOD_MS)
    })
})

describe('Period.setType', () => {
    it('only config.type changes; everything else is preserved', () => {
        const period = makePeriod({
            type: 'work',
            note: 'hello',
            duration: 30 * 60 * 1000,
            elapsed: 5 * 60 * 1000,
        })
        const result = Period.setType(period, 'break')

        expect(result.config.type).toBe('break')
        expect(result.config.note).toBe('hello')
        expect(result.config.userIntendedDuration).toBe(period.config.userIntendedDuration)
        expect(result.state).toEqual(period.state)
    })

    it('input period is not mutated', () => {
        const period = makePeriod({ type: 'work' })
        Period.setType(period, 'fun')

        expect(period.config.type).toBe('work')
    })

    it('state is fully preserved', () => {
        const period = makePeriod({
            duration: 48 * 60 * 1000,
            elapsed: 10 * 60 * 1000,
            remaining: 38 * 60 * 1000,
        })
        const result = Period.setType(period, 'fun')

        expect(result.state.duration).toBe(period.state.duration)
        expect(result.state.elapsed).toBe(period.state.elapsed)
        expect(result.state.remaining).toBe(period.state.remaining)
    })
})

describe('Period.setNote', () => {
    it('only config.note changes; everything else is preserved', () => {
        const period = makePeriod({ type: 'work', note: 'old note', duration: 30 * 60 * 1000 })
        const result = Period.setNote(period, 'new note')

        expect(result.config.note).toBe('new note')
        expect(result.config.type).toBe('work')
        expect(result.config.userIntendedDuration).toBe(period.config.userIntendedDuration)
        expect(result.state).toEqual(period.state)
    })

    it('input period is not mutated', () => {
        const period = makePeriod({ note: 'original' })
        Period.setNote(period, 'changed')

        expect(period.config.note).toBe('original')
    })

    it('state.duration, elapsed, remaining are all untouched', () => {
        const period = makePeriod({
            duration: 48 * 60 * 1000,
            elapsed: 10 * 60 * 1000,
            remaining: 38 * 60 * 1000,
        })
        const result = Period.setNote(period, 'new')

        expect(result.state.duration).toBe(period.state.duration)
        expect(result.state.elapsed).toBe(period.state.elapsed)
        expect(result.state.remaining).toBe(period.state.remaining)
    })
})

describe('Period.setPlannedDuration', () => {
    it('happy path: ms > elapsed → duration and userIntendedDuration updated, remaining recomputed, elapsed preserved', () => {
        const elapsed = 10 * 60 * 1000
        const period = makePeriod({
            duration: 48 * 60 * 1000,
            elapsed,
            remaining: 38 * 60 * 1000,
            userIntendedDuration: 48 * 60 * 1000,
        })
        const newMs = 60 * 60 * 1000
        const result = Period.setPlannedDuration(period, newMs)

        expect(result.state.duration).toBe(newMs)
        expect(result.config.userIntendedDuration).toBe(newMs)
        expect(result.state.elapsed).toBe(elapsed)
        expect(result.state.remaining).toBe(newMs - elapsed)
    })

    it('ms < elapsed → duration floors at elapsed; userIntendedDuration floors at elapsed', () => {
        const elapsed = 40 * 60 * 1000
        const period = makePeriod({
            duration: 48 * 60 * 1000,
            elapsed,
            remaining: 8 * 60 * 1000,
            userIntendedDuration: 48 * 60 * 1000,
        })
        const newMs = 20 * 60 * 1000 // less than elapsed
        const result = Period.setPlannedDuration(period, newMs)

        expect(result.state.duration).toBe(elapsed)
        expect(result.config.userIntendedDuration).toBe(elapsed)
        expect(result.state.remaining).toBe(0)
        expect(result.state.elapsed).toBe(elapsed)
    })

    it('ms == elapsed → duration = elapsed, remaining = 0', () => {
        const elapsed = 30 * 60 * 1000
        const period = makePeriod({
            duration: 48 * 60 * 1000,
            elapsed,
            remaining: 18 * 60 * 1000,
            userIntendedDuration: 48 * 60 * 1000,
        })
        const result = Period.setPlannedDuration(period, elapsed)

        expect(result.state.duration).toBe(elapsed)
        expect(result.config.userIntendedDuration).toBe(elapsed)
        expect(result.state.remaining).toBe(0)
        expect(result.state.elapsed).toBe(elapsed)
    })

    it('input is not mutated', () => {
        const period = makePeriod({
            duration: 48 * 60 * 1000,
            elapsed: 10 * 60 * 1000,
            userIntendedDuration: 48 * 60 * 1000,
        })
        const originalDuration = period.state.duration
        const originalUserIntended = period.config.userIntendedDuration

        Period.setPlannedDuration(period, 60 * 60 * 1000)

        expect(period.state.duration).toBe(originalDuration)
        expect(period.config.userIntendedDuration).toBe(originalUserIntended)
    })

    it('config.type and config.note are preserved', () => {
        const period = makePeriod({
            type: 'break',
            note: 'coffee',
            duration: 12 * 60 * 1000,
            elapsed: 3 * 60 * 1000,
            userIntendedDuration: 12 * 60 * 1000,
        })
        const result = Period.setPlannedDuration(period, 15 * 60 * 1000)

        expect(result.config.type).toBe('break')
        expect(result.config.note).toBe('coffee')
    })

    it('unstarted period (elapsed = 0): ms sets duration and remaining to ms', () => {
        const period = makePeriod({
            duration: 48 * 60 * 1000,
            elapsed: 0,
            remaining: 48 * 60 * 1000,
            userIntendedDuration: 48 * 60 * 1000,
        })
        const newMs = 30 * 60 * 1000
        const result = Period.setPlannedDuration(period, newMs)

        expect(result.state.duration).toBe(newMs)
        expect(result.config.userIntendedDuration).toBe(newMs)
        expect(result.state.elapsed).toBe(0)
        expect(result.state.remaining).toBe(newMs)
    })

    it('ms below MIN_PERIOD_MS on unstarted period → floored at MIN_PERIOD_MS', () => {
        const period = makePeriod({
            duration: 5 * 60 * 1000,
            elapsed: 0,
            remaining: 5 * 60 * 1000,
            userIntendedDuration: 5 * 60 * 1000,
        })
        const result = Period.setPlannedDuration(period, 30 * 1000)

        expect(result.state.duration).toBe(MIN_PERIOD_MS)
        expect(result.config.userIntendedDuration).toBe(MIN_PERIOD_MS)
        expect(result.state.remaining).toBe(MIN_PERIOD_MS)
    })
})

describe('Period.amendRecordedDuration', () => {
    it('happy path: elapsed = duration = userIntendedDuration = ms; remaining = 0', () => {
        const period = makePeriod({
            duration: 48 * 60 * 1000,
            elapsed: 48 * 60 * 1000,
            remaining: 0,
            userIntendedDuration: 48 * 60 * 1000,
        })
        const newMs = 30 * 60 * 1000
        const result = Period.amendRecordedDuration(period, newMs)

        expect(result.state.elapsed).toBe(newMs)
        expect(result.state.duration).toBe(newMs)
        expect(result.config.userIntendedDuration).toBe(newMs)
        expect(result.state.remaining).toBe(0)
    })

    it('works regardless of input elapsed (no elapsed-floor — rewrites the record)', () => {
        const period = makePeriod({
            duration: 60 * 60 * 1000,
            elapsed: 55 * 60 * 1000,
            remaining: 5 * 60 * 1000,
            userIntendedDuration: 60 * 60 * 1000,
        })
        const newMs = 30 * 60 * 1000 // less than current elapsed — allowed for Past periods
        const result = Period.amendRecordedDuration(period, newMs)

        expect(result.state.elapsed).toBe(newMs)
        expect(result.state.duration).toBe(newMs)
        expect(result.config.userIntendedDuration).toBe(newMs)
        expect(result.state.remaining).toBe(0)
    })

    it('input is not mutated', () => {
        const period = makePeriod({
            duration: 48 * 60 * 1000,
            elapsed: 48 * 60 * 1000,
            remaining: 0,
            userIntendedDuration: 48 * 60 * 1000,
        })
        const originalElapsed = period.state.elapsed
        const originalDuration = period.state.duration

        Period.amendRecordedDuration(period, 20 * 60 * 1000)

        expect(period.state.elapsed).toBe(originalElapsed)
        expect(period.state.duration).toBe(originalDuration)
    })

    it('config.type and config.note are preserved', () => {
        const period = makePeriod({
            type: 'work',
            note: 'deep focus',
            duration: 48 * 60 * 1000,
            elapsed: 48 * 60 * 1000,
            remaining: 0,
            userIntendedDuration: 48 * 60 * 1000,
        })
        const result = Period.amendRecordedDuration(period, 30 * 60 * 1000)

        expect(result.config.type).toBe('work')
        expect(result.config.note).toBe('deep focus')
    })

    it('ms below MIN_PERIOD_MS → floored at MIN_PERIOD_MS', () => {
        const period = makePeriod({
            duration: 48 * 60 * 1000,
            elapsed: 48 * 60 * 1000,
            remaining: 0,
            userIntendedDuration: 48 * 60 * 1000,
        })
        const result = Period.amendRecordedDuration(period, 0)

        expect(result.state.elapsed).toBe(MIN_PERIOD_MS)
        expect(result.state.duration).toBe(MIN_PERIOD_MS)
        expect(result.config.userIntendedDuration).toBe(MIN_PERIOD_MS)
        expect(result.state.remaining).toBe(0)
    })
})
