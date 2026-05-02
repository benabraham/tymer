import { describe, beforeEach, it, expect, vi } from 'vitest'
import {
    timerState,
    initialState,
    timerDuration,
    timerDurationElapsed,
    timerDurationRemaining,
    timerHasFinished,
    moveToNextPeriod,
    handleTimerCompletion,
} from './timer'
import { PERIOD_CONFIG } from './config'

// Mock localStorage
const localStorageMock = {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
}
global.localStorage = localStorageMock

// Mock audio
vi.mock('./sounds', () => ({
    playSound: vi.fn(),
    playTimerNotifications: vi.fn(),
    playPeriodEndNotification: vi.fn(),
    invalidateSoundWindows: vi.fn(),
}))

describe('Timer Logic - Simple Tests', () => {
    beforeEach(() => {
        // Reset timer state before each test
        timerState.value = {
            ...initialState,
            periods: PERIOD_CONFIG.map(({ duration, type, note = '' }) => ({
                config: { type, note, userIntendedDuration: duration },
                state: { duration, elapsed: 0, remaining: duration },
            })),
        }
        vi.clearAllMocks()
    })

    describe('Initial State', () => {
        it('should have correct initial state', () => {
            expect(timerState.value.currentPeriodIndex).toBe(null)
            expect(timerState.value.phase).toBe('idle')
            expect(timerState.value.timestampPaused).toBe(null)
            expect(timerState.value.timestampStarted).toBe(null)
            expect(timerState.value.periods.length).toBeGreaterThan(0)
        })

        it('should initialize periods from PERIOD_CONFIG', () => {
            expect(timerState.value.periods.length).toBe(PERIOD_CONFIG.length)
            timerState.value.periods.forEach((period, index) => {
                expect(period.state.duration).toBe(PERIOD_CONFIG[index].duration)
                expect(period.config.type).toBe(PERIOD_CONFIG[index].type)
                expect(period.state.elapsed).toBe(0)
                expect(period.state.finished).toBeUndefined()
            })
        })
    })

    describe('Computed Values', () => {
        it('should calculate timer duration correctly', () => {
            const expectedDuration = timerState.value.periods.reduce(
                (sum, p) => sum + p.state.duration,
                0,
            )
            expect(timerDuration.value).toBe(expectedDuration)
        })

        it('should calculate timer duration elapsed correctly', () => {
            timerState.value.periods[0].state.elapsed = 60000
            timerState.value.periods[1].state.elapsed = 30000

            expect(timerDurationElapsed.value).toBe(90000)
        })

        it('should detect when timer is not finished initially', () => {
            expect(timerHasFinished.value).toBe(false)
        })
    })

    describe('Phase field', () => {
        it('should be idle on initial state', () => {
            expect(timerState.value.phase).toBe('idle')
        })

        it('should carry phase = running when state is set directly', () => {
            timerState.value = { ...timerState.value, phase: 'running' }
            expect(timerState.value.phase).toBe('running')
        })

        it('should carry phase = paused when state is set directly', () => {
            timerState.value = { ...timerState.value, phase: 'paused' }
            expect(timerState.value.phase).toBe('paused')
        })

        it('should transition to completed when handleTimerCompletion is called', () => {
            const lastPeriodIndex = timerState.value.periods.length - 1
            timerState.value = {
                ...timerState.value,
                currentPeriodIndex: lastPeriodIndex,
                phase: 'running',
                timestampStarted: Date.now() - 180000,
                periods: timerState.value.periods.map((period, index) => ({
                    ...period,
                    state: {
                        ...period.state,
                        elapsed: 180000,
                        remaining: 0,
                    },
                })),
            }
            handleTimerCompletion()
            expect(timerState.value.phase).toBe('completed')
        })

        it('timerHasFinished should be true when phase is completed', () => {
            timerState.value = { ...timerState.value, phase: 'completed' }
            expect(timerHasFinished.value).toBe(true)
        })

        it('timerHasFinished should be false when phase is idle, running, or paused', () => {
            expect(timerHasFinished.value).toBe(false)
            timerState.value = { ...timerState.value, phase: 'running' }
            expect(timerHasFinished.value).toBe(false)
            timerState.value = { ...timerState.value, phase: 'paused' }
            expect(timerHasFinished.value).toBe(false)
        })
    })

    describe('Move to Next Period with Remainder Carry-forward', () => {
        beforeEach(() => {
            // Set up a running timer
            timerState.value = {
                ...timerState.value,
                currentPeriodIndex: 0,
                timestampStarted: Date.now() - 61000, // 1:01 elapsed
                periods: timerState.value.periods.map((period, index) => ({
                    ...period,
                    state: {
                        ...period.state,
                        elapsed: index === 0 ? 61000 : 0, // 1:01 on first period
                        remaining:
                            index === 0 ? period.state.duration - 61000 : period.state.duration,
                    },
                })),
            }
        })

        it('should round current period down and carry remainder to next period', () => {
            const originalTimestamp = Date.now()
            vi.spyOn(Date, 'now').mockReturnValue(originalTimestamp)

            // Current period has 1:01 elapsed (61000ms)
            expect(timerState.value.periods[0].state.elapsed).toBe(61000)

            moveToNextPeriod()

            // Current period (now previous) should be rounded down to 1:00
            expect(timerState.value.periods[0].state.duration).toBe(60000)
            expect(timerState.value.periods[0].state.elapsed).toBe(60000)
            // Past lifecycle is determined by position (index < currentPeriodIndex), not a flag

            // Should have moved to next period
            expect(timerState.value.currentPeriodIndex).toBe(1)

            // Timestamp should be adjusted to carry forward the 1 second remainder
            const expectedTimestamp =
                originalTimestamp - timerState.value.periods[1].state.elapsed - 1000
            expect(timerState.value.timestampStarted).toBe(expectedTimestamp)

            vi.restoreAllMocks()
        })

        it('should handle exact minute transitions without remainder', () => {
            const originalTimestamp = Date.now()
            vi.spyOn(Date, 'now').mockReturnValue(originalTimestamp)

            // Set exactly 2 minutes elapsed — also align timestampStarted so
            // updateCurrentPeriod() computes the same elapsed when called.
            timerState.value = {
                ...timerState.value,
                timestampStarted: originalTimestamp - 120000,
                periods: timerState.value.periods.map((period, index) => ({
                    ...period,
                    state: {
                        ...period.state,
                        elapsed: index === 0 ? 120000 : period.state.elapsed,
                        remaining:
                            index === 0 ? period.state.duration - 120000 : period.state.remaining,
                    },
                })),
            }

            moveToNextPeriod()

            // Should be exactly 2:00 with no remainder
            expect(timerState.value.periods[0].state.duration).toBe(120000)
            expect(timerState.value.periods[0].state.elapsed).toBe(120000)

            // No remainder to carry forward
            const expectedTimestamp = originalTimestamp - timerState.value.periods[1].state.elapsed
            expect(timerState.value.timestampStarted).toBe(expectedTimestamp)

            vi.restoreAllMocks()
        })

        it('should handle small elapsed times with remainder carry-forward (boundary case)', () => {
            // Test with small numbers that round down to exactly 1:00 and carry forward remainder
            const originalTimestamp = Date.now()
            vi.spyOn(Date, 'now').mockReturnValue(originalTimestamp)

            // Set up with 1:15 elapsed (rounds down to 1:00, carries 15 seconds)
            timerState.value = {
                ...timerState.value,
                currentPeriodIndex: 0,
                timestampStarted: originalTimestamp - 75000, // 1:15 elapsed
                periods: timerState.value.periods.map((period, index) => ({
                    ...period,
                    state: {
                        ...period.state,
                        elapsed: index === 0 ? 75000 : 0, // 1:15 on first period
                        remaining:
                            index === 0 ? period.state.duration - 75000 : period.state.duration,
                    },
                })),
            }

            expect(timerState.value.periods[0].state.elapsed).toBe(75000)

            moveToNextPeriod()

            // Current period (now previous) should be rounded down to 1:00
            expect(timerState.value.periods[0].state.duration).toBe(60000)
            expect(timerState.value.periods[0].state.elapsed).toBe(60000)
            // Past lifecycle is determined by position (index < currentPeriodIndex), not a flag

            // Should have moved to next period
            expect(timerState.value.currentPeriodIndex).toBe(1)

            // Timestamp should be adjusted to carry forward the 15 second remainder
            const expectedTimestamp =
                originalTimestamp - timerState.value.periods[1].state.elapsed - 15000
            expect(timerState.value.timestampStarted).toBe(expectedTimestamp)

            vi.restoreAllMocks()
        })

        it('should handle maximum remainder carry-forward (1:59 -> 1:00 + 59s)', () => {
            // Test the edge case of maximum remainder (59 seconds)
            const originalTimestamp = Date.now()
            vi.spyOn(Date, 'now').mockReturnValue(originalTimestamp)

            // Set up with 1:59 elapsed (rounds down to 1:00, carries 59 seconds)
            timerState.value = {
                ...timerState.value,
                currentPeriodIndex: 0,
                timestampStarted: originalTimestamp - 119000, // 1:59 elapsed
                periods: timerState.value.periods.map((period, index) => ({
                    ...period,
                    state: {
                        ...period.state,
                        elapsed: index === 0 ? 119000 : 0, // 1:59 on first period
                        remaining:
                            index === 0 ? period.state.duration - 119000 : period.state.duration,
                    },
                })),
            }

            expect(timerState.value.periods[0].state.elapsed).toBe(119000)

            moveToNextPeriod()

            // Current period (now previous) should be rounded down to 1:00
            expect(timerState.value.periods[0].state.duration).toBe(60000)
            expect(timerState.value.periods[0].state.elapsed).toBe(60000)
            // Past lifecycle is determined by position (index < currentPeriodIndex), not a flag

            // Should have moved to next period
            expect(timerState.value.currentPeriodIndex).toBe(1)

            // Timestamp should be adjusted to carry forward the 59 second remainder
            const expectedTimestamp =
                originalTimestamp - timerState.value.periods[1].state.elapsed - 59000
            expect(timerState.value.timestampStarted).toBe(expectedTimestamp)

            vi.restoreAllMocks()
        })
    })

    describe('Timer Completion with Base Rounding', () => {
        beforeEach(() => {
            // Set up timer on last period with substantial elapsed time to avoid filtering
            const lastPeriodIndex = timerState.value.periods.length - 1
            timerState.value = {
                ...timerState.value,
                currentPeriodIndex: lastPeriodIndex,
                timestampStarted: Date.now() - 149000, // 2:29 elapsed - rounds down to 2:00 (120000ms > 60000ms threshold)
                periods: timerState.value.periods.map((period, index) => ({
                    ...period,
                    state: {
                        ...period.state,
                        elapsed:
                            index === lastPeriodIndex
                                ? 149000
                                : index < lastPeriodIndex
                                  ? 180000
                                  : 0, // Previous periods have 3+ minutes, last has 2:29
                        remaining:
                            index === lastPeriodIndex
                                ? period.state.duration - 149000
                                : period.state.duration,
                    },
                })),
            }
        })

        it('should round final period down to base minute on completion', () => {
            // Last period has 2:29 elapsed (149000ms)
            const lastPeriodIndex = timerState.value.periods.length - 1
            const originalLastPeriod = timerState.value.periods[lastPeriodIndex]
            expect(originalLastPeriod.state.elapsed).toBe(149000)

            handleTimerCompletion()

            // Find the period that corresponds to our original last period
            // Since we set all previous periods to have 180000ms elapsed, they should all remain
            // The last period with 149000ms -> 120000ms should also remain (well above the 60000ms threshold)
            const remainingPeriods = timerState.value.periods

            // The period that was the last one should now have been rounded down to 2:00
            // We need to find it by checking which period was modified
            const modifiedPeriod = remainingPeriods.find(
                period => period.state.duration === 120000 && period.state.elapsed === 120000,
            )

            expect(modifiedPeriod).toBeDefined()
            expect(modifiedPeriod.state.duration).toBe(120000)
            expect(modifiedPeriod.state.elapsed).toBe(120000)

            // Timer should be in completed state
            expect(timerState.value.currentPeriodIndex).toBe(null)
            expect(timerState.value.timestampStarted).toBe(null)
        })

        it('should handle exact minute completion without rounding', () => {
            // Set exactly 3 minutes elapsed (well above filter threshold).
            // Also align timestampStarted so updateCurrentPeriod() computes the
            // same elapsed when called inside handleTimerCompletion.
            const lastPeriodIndex = timerState.value.periods.length - 1
            timerState.value = {
                ...timerState.value,
                timestampStarted: Date.now() - 180000,
                periods: timerState.value.periods.map((period, index) => ({
                    ...period,
                    state: {
                        ...period.state,
                        elapsed: index === lastPeriodIndex ? 180000 : period.state.elapsed,
                        remaining:
                            index === lastPeriodIndex
                                ? period.state.duration - 180000
                                : period.state.remaining,
                    },
                })),
            }

            handleTimerCompletion()

            // Find the period in the remaining periods
            const remainingPeriods = timerState.value.periods
            const finalPeriod = remainingPeriods[remainingPeriods.length - 1]

            // Should remain exactly 3:00
            expect(finalPeriod.state.duration).toBe(180000)
            expect(finalPeriod.state.elapsed).toBe(180000)
        })

        it('should keep periods with exactly 1 minute elapsed time', () => {
            // Set up a scenario where a period rounds down to exactly 1:00 (60000ms)
            const lastPeriodIndex = timerState.value.periods.length - 1
            timerState.value = {
                ...timerState.value,
                currentPeriodIndex: lastPeriodIndex,
                timestampStarted: Date.now() - 61000, // 1:01 elapsed - rounds down to 1:00
                periods: timerState.value.periods.map((period, index) => ({
                    ...period,
                    state: {
                        ...period.state,
                        elapsed:
                            index === lastPeriodIndex
                                ? 61000
                                : index < lastPeriodIndex
                                  ? 120000
                                  : 0,
                        remaining:
                            index === lastPeriodIndex
                                ? period.state.duration - 61000
                                : period.state.duration,
                    },
                })),
            }

            expect(timerState.value.periods[lastPeriodIndex].state.elapsed).toBe(61000)

            handleTimerCompletion()

            // Find the period that was rounded down to exactly 1:00
            const remainingPeriods = timerState.value.periods
            const oneMinutePeriod = remainingPeriods.find(
                period => period.state.duration === 60000 && period.state.elapsed === 60000,
            )

            // Period with exactly 1:00 should be kept (>= threshold, not > threshold)
            expect(oneMinutePeriod).toBeDefined()
            expect(oneMinutePeriod.state.duration).toBe(60000)
            expect(oneMinutePeriod.state.elapsed).toBe(60000)

            // Timer should be in completed state
            expect(timerState.value.currentPeriodIndex).toBe(null)
            expect(timerState.value.timestampStarted).toBe(null)
        })

        it('should round small elapsed times down to base minute on completion', () => {
            // Test with small numbers that round down to exactly 1:00 (the boundary case)
            const lastPeriodIndex = timerState.value.periods.length - 1
            timerState.value = {
                ...timerState.value,
                currentPeriodIndex: lastPeriodIndex,
                timestampStarted: Date.now() - 75000, // 1:15 elapsed - rounds down to 1:00
                periods: timerState.value.periods.map((period, index) => ({
                    ...period,
                    state: {
                        ...period.state,
                        elapsed:
                            index === lastPeriodIndex ? 75000 : index < lastPeriodIndex ? 90000 : 0, // Previous periods have 1:30, last has 1:15
                        remaining:
                            index === lastPeriodIndex
                                ? period.state.duration - 75000
                                : period.state.duration,
                    },
                })),
            }

            expect(timerState.value.periods[lastPeriodIndex].state.elapsed).toBe(75000)

            handleTimerCompletion()

            // Find the period that was rounded down to exactly 1:00
            const remainingPeriods = timerState.value.periods
            const oneMinutePeriod = remainingPeriods.find(
                period => period.state.duration === 60000 && period.state.elapsed === 60000,
            )

            // Period with 1:15 should be rounded down to exactly 1:00 and kept
            expect(oneMinutePeriod).toBeDefined()
            expect(oneMinutePeriod.state.duration).toBe(60000)
            expect(oneMinutePeriod.state.elapsed).toBe(60000)

            // Timer should be in completed state
            expect(timerState.value.currentPeriodIndex).toBe(null)
            expect(timerState.value.timestampStarted).toBe(null)
        })

        it('should handle edge case of 1:59 rounding down to 1:00 on completion', () => {
            // Test the largest possible remainder (59 seconds) that still rounds to 1:00
            const lastPeriodIndex = timerState.value.periods.length - 1
            timerState.value = {
                ...timerState.value,
                currentPeriodIndex: lastPeriodIndex,
                timestampStarted: Date.now() - 119000, // 1:59 elapsed - rounds down to 1:00
                periods: timerState.value.periods.map((period, index) => ({
                    ...period,
                    state: {
                        ...period.state,
                        elapsed:
                            index === lastPeriodIndex
                                ? 119000
                                : index < lastPeriodIndex
                                  ? 90000
                                  : 0,
                        remaining:
                            index === lastPeriodIndex
                                ? period.state.duration - 119000
                                : period.state.duration,
                    },
                })),
            }

            expect(timerState.value.periods[lastPeriodIndex].state.elapsed).toBe(119000)

            handleTimerCompletion()

            // Find the period that was rounded down to exactly 1:00
            const remainingPeriods = timerState.value.periods
            const oneMinutePeriod = remainingPeriods.find(
                period => period.state.duration === 60000 && period.state.elapsed === 60000,
            )

            // Period with 1:59 should be rounded down to exactly 1:00 and kept (59 seconds lost)
            expect(oneMinutePeriod).toBeDefined()
            expect(oneMinutePeriod.state.duration).toBe(60000)
            expect(oneMinutePeriod.state.elapsed).toBe(60000)

            // Timer should be in completed state
            expect(timerState.value.currentPeriodIndex).toBe(null)
            expect(timerState.value.timestampStarted).toBe(null)
        })

        it('should filter out periods with less than 1 minute elapsed time', () => {
            // Set up a scenario with periods having various elapsed times
            const lastPeriodIndex = timerState.value.periods.length - 1
            timerState.value = {
                ...timerState.value,
                currentPeriodIndex: lastPeriodIndex,
                timestampStarted: Date.now() - 59000, // 0:59 elapsed - rounds down to 0:00
                periods: timerState.value.periods.map((period, index) => ({
                    ...period,
                    state: {
                        ...period.state,
                        // Mix of periods: some with <1min, some with >=1min
                        elapsed:
                            index === lastPeriodIndex
                                ? 59000 // 0:59 -> 0:00 (should be filtered)
                                : index === lastPeriodIndex - 1
                                  ? 45000 // 0:45 -> 0:00 (should be filtered)
                                  : index === lastPeriodIndex - 2
                                    ? 61000 // 1:01 -> 1:00 (should be kept)
                                    : 120000, // 2:00 (should be kept)
                        remaining: period.state.duration,
                    },
                })),
            }

            const originalPeriodsCount = timerState.value.periods.length

            handleTimerCompletion()

            const remainingPeriods = timerState.value.periods

            // Should have fewer periods after filtering
            expect(remainingPeriods.length).toBeLessThan(originalPeriodsCount)

            // All remaining periods should have >= 1 minute elapsed
            remainingPeriods.forEach(period => {
                expect(period.state.elapsed).toBeGreaterThanOrEqual(60000)
            })

            // Should not find any periods with 0:00 elapsed (the filtered ones)
            const zeroPeriods = remainingPeriods.filter(period => period.state.elapsed === 0)
            expect(zeroPeriods.length).toBe(0)

            // Timer should be in completed state
            expect(timerState.value.currentPeriodIndex).toBe(null)
            expect(timerState.value.timestampStarted).toBe(null)
        })
    })
})
