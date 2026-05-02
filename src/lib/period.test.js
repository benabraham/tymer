import { describe, it, expect } from 'vitest'
import { Period } from './period'

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
