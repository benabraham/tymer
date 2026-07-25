import { describe, beforeEach, afterEach, it, expect, vi } from 'vitest'
import {
    timerState,
    initialState,
    pinTimer,
    unpinTimer,
    togglePinTimer,
    canTogglePin,
    reconcileToAnchor,
    advanceOverduePeriods,
    timerDurationElapsed,
    currentPeriod,
    moveToPreviousPeriod,
    pauseTimer,
    resumeTimer,
    pauseForEditing,
    resumeAfterEditing,
    canAdjustElapsed,
    canAdjustElapsedForward,
    canAdjustElapsedBackward,
    canMoveElapsedToPrevious,
    startTimer,
    applyCurrentDurations,
    applyActiveConfig,
    editingCurrentDurations,
    currentDurationsText,
} from './timer'
import { Schedule } from './schedule'
import { PERIOD_CONFIG } from './config'
import {
    addConfig,
    updateConfigText,
    selectConfig,
    deleteConfig,
    BUILTIN_CONFIG,
} from './period-configs'

const msToMinutesSinceMidnight = ms => {
    const date = new Date(ms)
    return date.getHours() * 60 + date.getMinutes()
}

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
    playTimerFinishedSound: vi.fn(),
    playPeriodSound: vi.fn(),
    getSoundKeyFromPath: vi.fn(() => 'key'),
}))

// Stub Worker — jsdom has no Worker implementation, and startTick()/initWorker()
// construct one for real. We only need postMessage to be a no-op; tick() itself
// is exercised directly via advanceOverduePeriods in these tests.
class FakeWorker {
    postMessage() {}
}
global.Worker = FakeWorker

const freshPeriods = () =>
    PERIOD_CONFIG.map(({ duration, type, note = '' }) => ({
        config: { type, note, userIntendedDuration: duration },
        state: { duration, elapsed: 0, remaining: duration },
    }))

describe('Timer anchor lifecycle', () => {
    beforeEach(() => {
        Schedule.reset()
        timerState.value = { ...initialState, periods: freshPeriods() }
        vi.clearAllMocks()
        vi.useRealTimers()
    })

    describe('pinTimer', () => {
        it('idle + no arg: pins to Date.now()', () => {
            vi.useFakeTimers()
            vi.setSystemTime(1_000_000)

            pinTimer()

            expect(Schedule.timestampAnchor.value).toBe(1_000_000)
        })

        it('idle + explicit ms: pins to the given value', () => {
            pinTimer(5_000_000)

            expect(Schedule.timestampAnchor.value).toBe(5_000_000)
        })

        it('paused: no-op', () => {
            Schedule.setSnapshot({
                phase: 'paused',
                currentPeriodIndex: 0,
                timestampStarted: Date.now() - 60_000,
                timestampPaused: Date.now(),
                timestampAnchor: null,
            })

            pinTimer(5_000_000)

            expect(Schedule.timestampAnchor.value).toBeNull()
        })

        it('completed: no-op', () => {
            Schedule.setSnapshot({
                phase: 'completed',
                currentPeriodIndex: null,
                timestampStarted: null,
                timestampPaused: null,
                timestampAnchor: null,
            })

            pinTimer(5_000_000)

            expect(Schedule.timestampAnchor.value).toBeNull()
        })

        it('running: anchor = now - total elapsed across all periods', () => {
            vi.useFakeTimers()
            vi.setSystemTime(1_000_000)

            Schedule.setSnapshot({
                phase: 'running',
                currentPeriodIndex: 0,
                timestampStarted: 1_000_000 - 30_000, // 30s elapsed on current period
                timestampPaused: null,
                timestampAnchor: null,
            })
            // second period already has 10s elapsed from a prior visit
            timerState.value = {
                ...timerState.value,
                periods: timerState.value.periods.map((p, i) =>
                    i === 1 ? { ...p, state: { ...p.state, elapsed: 10_000 } } : p,
                ),
            }

            pinTimer()

            // updateCurrentPeriod() refreshes period 0's elapsed to 30_000 first.
            // total elapsed = 30_000 (period 0) + 10_000 (period 1) = 40_000
            // anchor = now - totalElapsed = 1_000_000 - 40_000 = 960_000
            expect(Schedule.timestampAnchor.value).toBe(960_000)
        })

        it('running: anchorMs param is ignored (v1 always freezes derived start)', () => {
            vi.useFakeTimers()
            vi.setSystemTime(1_000_000)

            Schedule.setSnapshot({
                phase: 'running',
                currentPeriodIndex: 0,
                timestampStarted: 1_000_000 - 30_000,
                timestampPaused: null,
                timestampAnchor: null,
            })

            pinTimer(123) // should be ignored while running

            expect(Schedule.timestampAnchor.value).toBe(1_000_000 - 30_000)
        })
    })

    describe('unpinTimer', () => {
        it('clears the anchor', () => {
            pinTimer(5_000_000)
            unpinTimer()
            expect(Schedule.timestampAnchor.value).toBeNull()
        })
    })

    describe('togglePinTimer', () => {
        it('pins when not anchored', () => {
            togglePinTimer()
            expect(Schedule.isAnchored.value).toBe(true)
        })

        it('unpins when anchored', () => {
            pinTimer(5_000_000)
            togglePinTimer()
            expect(Schedule.isAnchored.value).toBe(false)
        })

        it('plays the button sound', async () => {
            const { playSound } = await import('./sounds')
            togglePinTimer()
            expect(playSound).toHaveBeenCalledWith('button')
        })
    })

    describe('canTogglePin', () => {
        it('true while idle', () => {
            expect(canTogglePin.value).toBe(true)
        })

        it('true while running', () => {
            Schedule.setSnapshot({
                phase: 'running',
                currentPeriodIndex: 0,
                timestampStarted: Date.now(),
                timestampPaused: null,
                timestampAnchor: null,
            })
            expect(canTogglePin.value).toBe(true)
        })

        it('false while paused', () => {
            Schedule.setSnapshot({
                phase: 'paused',
                currentPeriodIndex: 0,
                timestampStarted: Date.now() - 60_000,
                timestampPaused: Date.now(),
                timestampAnchor: null,
            })
            expect(canTogglePin.value).toBe(false)
        })

        it('false while completed', () => {
            Schedule.setSnapshot({
                phase: 'completed',
                currentPeriodIndex: null,
                timestampStarted: null,
                timestampPaused: null,
                timestampAnchor: null,
            })
            expect(canTogglePin.value).toBe(false)
        })
    })

    describe('reconcileToAnchor', () => {
        it('no-op when not anchored', () => {
            Schedule.setSnapshot({
                phase: 'running',
                currentPeriodIndex: 0,
                timestampStarted: 1_000_000,
                timestampPaused: null,
                timestampAnchor: null,
            })

            reconcileToAnchor()

            expect(Schedule.timestampStarted.value).toBe(1_000_000)
        })

        it('no-op when currentPeriodIndex is null', () => {
            Schedule.setSnapshot({
                phase: 'idle',
                currentPeriodIndex: null,
                timestampStarted: null,
                timestampPaused: null,
                timestampAnchor: 500_000,
            })

            reconcileToAnchor()

            expect(Schedule.timestampStarted.value).toBeNull()
        })

        it('shifts timestampStarted so elapsed reflects the anchor + prior periods elapsed', () => {
            // anchor pinned at 900_000; period 0 elapsed 10_000 (Past), current is period 1
            Schedule.setSnapshot({
                phase: 'running',
                currentPeriodIndex: 1,
                timestampStarted: 1_000_000, // arbitrary, stale value to be corrected
                timestampPaused: null,
                timestampAnchor: 900_000,
            })
            timerState.value = {
                ...timerState.value,
                periods: timerState.value.periods.map((p, i) =>
                    i === 0 ? { ...p, state: { ...p.state, elapsed: 10_000 } } : p,
                ),
            }

            reconcileToAnchor()

            // desiredTS = anchor + sum(elapsed of periods except current) = 900_000 + 10_000 = 910_000
            expect(Schedule.timestampStarted.value).toBe(910_000)
        })
    })

    describe('advanceOverduePeriods', () => {
        it('no-op when not anchored', () => {
            Schedule.setSnapshot({
                phase: 'running',
                currentPeriodIndex: 0,
                timestampStarted: Date.now() - 30 * 60 * 1000,
                timestampPaused: null,
                timestampAnchor: null,
            })

            advanceOverduePeriods()

            expect(Schedule.currentPeriodIndex.value).toBe(0)
        })

        it('single boundary: auto-advances to the next period, no auto-extend', () => {
            vi.useFakeTimers()
            vi.setSystemTime(1_000_000)
            // anchor 25 min ago; period 0 is a 24-min work period → overdue by 1 min
            const anchor = 1_000_000 - 25 * 60 * 1000
            Schedule.setSnapshot({
                phase: 'running',
                currentPeriodIndex: 0,
                timestampStarted: anchor,
                timestampPaused: null,
                timestampAnchor: anchor,
            })

            advanceOverduePeriods()

            expect(Schedule.currentPeriodIndex.value).toBe(1)
            // period 0 completed at its planned duration exactly (24 min), not extended
            expect(timerState.value.periods[0].state.elapsed).toBe(24 * 60 * 1000)
            expect(timerState.value.periods[0].state.duration).toBe(24 * 60 * 1000)
            // overshoot (1 min) carries forward as elapsed on the next (break) period
            expect(currentPeriod.value.state.elapsed).toBe(1 * 60 * 1000)
        })

        it('invariant holds after single-boundary advance: total elapsed === now - anchor', () => {
            vi.useFakeTimers()
            vi.setSystemTime(1_000_000)
            const anchor = 1_000_000 - 25 * 60 * 1000
            Schedule.setSnapshot({
                phase: 'running',
                currentPeriodIndex: 0,
                timestampStarted: anchor,
                timestampPaused: null,
                timestampAnchor: anchor,
            })

            advanceOverduePeriods()

            expect(timerDurationElapsed.value).toBe(Date.now() - anchor)
        })

        it('multi-boundary catch-up: anchor 143 min in the past over 24/6/24/6… lands on index 8 with elapsed 23 min', () => {
            vi.useFakeTimers()
            vi.setSystemTime(1_000_000)
            const anchor = 1_000_000 - 143 * 60 * 1000
            Schedule.setSnapshot({
                phase: 'running',
                currentPeriodIndex: 0,
                timestampStarted: anchor,
                timestampPaused: null,
                timestampAnchor: anchor,
            })

            advanceOverduePeriods()

            expect(Schedule.currentPeriodIndex.value).toBe(8)
            expect(currentPeriod.value.state.elapsed).toBe(23 * 60 * 1000)
            // invariant: total elapsed across all periods === now - anchor
            expect(timerDurationElapsed.value).toBe(Date.now() - anchor)
        })

        it('last-period overrun extends the last period instead of self-finishing — no wall-clock time is lost', () => {
            // Small fixed timeline: 2 periods, 5 min each, so it's easy to overrun the last one.
            timerState.value = {
                ...timerState.value,
                periods: [
                    {
                        config: { type: 'work', note: '', userIntendedDuration: 5 * 60 * 1000 },
                        state: { duration: 5 * 60 * 1000, elapsed: 0, remaining: 5 * 60 * 1000 },
                    },
                    {
                        config: { type: 'break', note: '', userIntendedDuration: 5 * 60 * 1000 },
                        state: { duration: 5 * 60 * 1000, elapsed: 0, remaining: 5 * 60 * 1000 },
                    },
                ],
            }
            vi.useFakeTimers()
            vi.setSystemTime(1_000_000)
            // anchor 12 min ago: overruns both 5-min periods by 2 min total
            const anchor = 1_000_000 - 12 * 60 * 1000
            Schedule.setSnapshot({
                phase: 'running',
                currentPeriodIndex: 0,
                timestampStarted: anchor,
                timestampPaused: null,
                timestampAnchor: anchor,
            })

            advanceOverduePeriods()

            // the timer must NOT end on its own — the last period absorbs the overrun
            expect(Schedule.isCompleted.value).toBe(false)
            expect(Schedule.isRunning.value).toBe(true)
            expect(Schedule.currentPeriodIndex.value).toBe(1)
            const lastPeriod = timerState.value.periods[1]
            // 12 min wall-clock - 5 min period 0 = 7 min on the last period
            expect(lastPeriod.state.elapsed).toBe(7 * 60 * 1000)
            expect(lastPeriod.state.duration).toBe(7 * 60 * 1000)
            // auto-extension leaves the user's intent untouched
            expect(lastPeriod.config.userIntendedDuration).toBe(5 * 60 * 1000)
            // invariant: every wall-clock minute since the anchor is recorded
            expect(timerDurationElapsed.value).toBe(Date.now() - anchor)
        })

        it('a single-period timeline extends on overrun (no boundary to advance over)', () => {
            timerState.value = {
                ...timerState.value,
                periods: [
                    {
                        config: { type: 'work', note: '', userIntendedDuration: 5 * 60 * 1000 },
                        state: { duration: 5 * 60 * 1000, elapsed: 0, remaining: 5 * 60 * 1000 },
                    },
                ],
            }
            vi.useFakeTimers()
            vi.setSystemTime(1_000_000)
            const anchor = 1_000_000 - 9 * 60 * 1000
            Schedule.setSnapshot({
                phase: 'running',
                currentPeriodIndex: 0,
                timestampStarted: anchor,
                timestampPaused: null,
                timestampAnchor: anchor,
            })

            advanceOverduePeriods()

            expect(Schedule.isCompleted.value).toBe(false)
            expect(currentPeriod.value.state.elapsed).toBe(9 * 60 * 1000)
            expect(currentPeriod.value.state.duration).toBe(9 * 60 * 1000)
            expect(timerDurationElapsed.value).toBe(Date.now() - anchor)
        })

        it('invariant holds after a subsequent moveToPreviousPeriod while still anchored', () => {
            vi.useFakeTimers()
            vi.setSystemTime(1_000_000)
            const anchor = 1_000_000 - 25 * 60 * 1000
            Schedule.setSnapshot({
                phase: 'running',
                currentPeriodIndex: 0,
                timestampStarted: anchor,
                timestampPaused: null,
                timestampAnchor: anchor,
            })
            advanceOverduePeriods() // now on index 1

            moveToPreviousPeriod()

            expect(Schedule.currentPeriodIndex.value).toBe(0)
            expect(timerDurationElapsed.value).toBe(Date.now() - anchor)
        })
    })

    describe('pauseTimer unpins; pauseForEditing/resumeAfterEditing do not', () => {
        it('pauseTimer unpins an anchored, running timer', () => {
            vi.useFakeTimers()
            vi.setSystemTime(1_000_000)
            const anchor = 1_000_000 - 60_000
            Schedule.setSnapshot({
                phase: 'running',
                currentPeriodIndex: 0,
                timestampStarted: anchor,
                timestampPaused: null,
                timestampAnchor: anchor,
            })

            pauseTimer()

            expect(Schedule.isAnchored.value).toBe(false)
            expect(Schedule.isPaused.value).toBe(true)
        })

        it('pauseForEditing does NOT unpin', () => {
            vi.useFakeTimers()
            vi.setSystemTime(1_000_000)
            const anchor = 1_000_000 - 60_000
            Schedule.setSnapshot({
                phase: 'running',
                currentPeriodIndex: 0,
                timestampStarted: anchor,
                timestampPaused: null,
                timestampAnchor: anchor,
            })

            pauseForEditing()

            expect(Schedule.isAnchored.value).toBe(true)
            expect(Schedule.isPaused.value).toBe(true)
        })

        it('resumeAfterEditing does NOT unpin, and elapsed jumps forward over the edit pause (anchored)', () => {
            vi.useFakeTimers()
            vi.setSystemTime(1_000_000)
            const anchor = 1_000_000 - 60_000 // 1 min elapsed so far
            Schedule.setSnapshot({
                phase: 'running',
                currentPeriodIndex: 0,
                timestampStarted: anchor,
                timestampPaused: null,
                timestampAnchor: anchor,
            })

            pauseForEditing()
            // simulate 5 minutes passing while the editor is open
            vi.setSystemTime(1_000_000 + 5 * 60 * 1000)

            resumeAfterEditing()

            expect(Schedule.isAnchored.value).toBe(true)
            expect(Schedule.isRunning.value).toBe(true)
            // elapsed reflects the wall clock: anchor to "now" = 1 + 5 = 6 minutes
            expect(currentPeriod.value.state.elapsed).toBe(6 * 60 * 1000)
        })

        it('resumeAfterEditing extends the last period and keeps running when remaining time ran out while editing', () => {
            vi.useFakeTimers()
            vi.setSystemTime(1_000_000)
            const anchor = 1_000_000 - 20 * 60 * 1000 // 20 of 24 min elapsed
            timerState.value = {
                ...timerState.value,
                periods: [
                    {
                        config: { type: 'work', note: '', userIntendedDuration: 24 * 60 * 1000 },
                        state: {
                            duration: 24 * 60 * 1000,
                            elapsed: 20 * 60 * 1000,
                            remaining: 4 * 60 * 1000,
                        },
                    },
                ],
            }
            Schedule.setSnapshot({
                phase: 'running',
                currentPeriodIndex: 0,
                timestampStarted: anchor,
                timestampPaused: null,
                timestampAnchor: anchor,
            })

            pauseForEditing()
            // 10 minutes pass while the editor is open — the 4 remaining
            // minutes run out on the wall clock
            vi.setSystemTime(1_000_000 + 10 * 60 * 1000)

            const postMessage = vi.spyOn(FakeWorker.prototype, 'postMessage')
            resumeAfterEditing()

            // no self-finish — the last period stretches to cover the wall clock
            expect(Schedule.isCompleted.value).toBe(false)
            expect(Schedule.isRunning.value).toBe(true)
            expect(timerState.value.periods[0].state.elapsed).toBe(30 * 60 * 1000)
            expect(timerState.value.periods[0].state.duration).toBe(30 * 60 * 1000)
            // and the tick resumes normally
            expect(postMessage).toHaveBeenCalledWith('start')
            postMessage.mockRestore()
        })

        it('resumeAfterEditing when NOT anchored is byte-identical to plain pause/resume (no time jump)', () => {
            vi.useFakeTimers()
            vi.setSystemTime(1_000_000)
            Schedule.setSnapshot({
                phase: 'running',
                currentPeriodIndex: 0,
                timestampStarted: 1_000_000 - 60_000,
                timestampPaused: null,
                timestampAnchor: null,
            })

            pauseForEditing()
            vi.setSystemTime(1_000_000 + 5 * 60 * 1000) // 5 min pass while "editing"
            resumeAfterEditing()

            expect(Schedule.isRunning.value).toBe(true)
            // Plain pause/resume semantics: elapsed stays what it was when paused (1 min),
            // no jump forward for the time spent paused.
            expect(currentPeriod.value.state.elapsed).toBe(60_000)
        })
    })

    describe('elapsed-adjust guards while anchored', () => {
        beforeEach(() => {
            vi.useFakeTimers()
            vi.setSystemTime(1_000_000)
            const anchor = 1_000_000 - 60_000
            Schedule.setSnapshot({
                phase: 'running',
                currentPeriodIndex: 1,
                timestampStarted: anchor,
                timestampPaused: null,
                timestampAnchor: anchor,
            })
            timerState.value = {
                ...timerState.value,
                periods: timerState.value.periods.map((p, i) =>
                    i === 0 ? { ...p, state: { ...p.state, elapsed: 60_000 } } : p,
                ),
            }
        })

        it('canAdjustElapsed(amount) is false while anchored', () => {
            expect(canAdjustElapsed(60_000)).toBe(false)
            expect(canAdjustElapsed(-60_000)).toBe(false)
        })

        it('canAdjustElapsedForward is false while anchored', () => {
            expect(canAdjustElapsedForward.value).toBe(false)
        })

        it('canAdjustElapsedBackward is false while anchored', () => {
            expect(canAdjustElapsedBackward.value).toBe(false)
        })

        it('canMoveElapsedToPrevious STAYS enabled while anchored', () => {
            expect(canMoveElapsedToPrevious.value).toBe(true)
        })

        it('canAdjustElapsed is true again once unpinned', () => {
            Schedule.unpin()
            expect(canAdjustElapsed(60_000)).toBe(true)
        })
    })

    describe('startTimer with a future anchor', () => {
        it('re-pins to now when the anchor is in the future ("start now")', () => {
            vi.useFakeTimers()
            vi.setSystemTime(1_000_000)
            Schedule.reset()
            Schedule.pin(1_000_000 + 60_000) // 1 min in the future

            startTimer()

            expect(Schedule.timestampStarted.value).toBe(1_000_000)
        })

        it('a past anchor fast-forwards through overdue periods immediately on start', () => {
            vi.useFakeTimers()
            vi.setSystemTime(1_000_000)
            Schedule.reset()
            const anchor = 1_000_000 - 25 * 60 * 1000 // 25 min in the past
            Schedule.pin(anchor)

            startTimer()

            // period 0 (24 min work) is overdue by 1 min → auto-advanced
            expect(Schedule.currentPeriodIndex.value).toBe(1)
            expect(currentPeriod.value.state.elapsed).toBe(1 * 60 * 1000)
        })

        it('an anchor older than the whole timeline lands running on the last period with all wall-clock time recorded', () => {
            timerState.value = {
                ...timerState.value,
                periods: [
                    {
                        config: { type: 'work', note: '', userIntendedDuration: 5 * 60 * 1000 },
                        state: { duration: 5 * 60 * 1000, elapsed: 0, remaining: 5 * 60 * 1000 },
                    },
                    {
                        config: { type: 'break', note: '', userIntendedDuration: 5 * 60 * 1000 },
                        state: { duration: 5 * 60 * 1000, elapsed: 0, remaining: 5 * 60 * 1000 },
                    },
                ],
            }
            vi.useFakeTimers()
            vi.setSystemTime(1_000_000)
            Schedule.reset()
            const anchor = 1_000_000 - 60 * 60 * 1000 // 1 h ago, timeline is 10 min
            Schedule.pin(anchor)

            startTimer()

            // no instant self-finish — the timer is running on the last period,
            // extended to hold everything past the first period's 5 minutes
            expect(Schedule.isCompleted.value).toBe(false)
            expect(Schedule.isRunning.value).toBe(true)
            expect(Schedule.currentPeriodIndex.value).toBe(1)
            expect(currentPeriod.value.state.elapsed).toBe(55 * 60 * 1000)
            expect(timerDurationElapsed.value).toBe(60 * 60 * 1000)
        })
    })

    describe('resumeTimer with a paused + anchored session', () => {
        it('reconciles elapsed to the wall clock since the anchor on resume', () => {
            // paused + anchored is reachable by typing an @h:mm line in the
            // live editor while the timer is paused
            timerState.value = {
                ...timerState.value,
                periods: [
                    {
                        config: { type: 'work', note: '', userIntendedDuration: 60 * 60 * 1000 },
                        state: {
                            duration: 60 * 60 * 1000,
                            elapsed: 20 * 60 * 1000,
                            remaining: 40 * 60 * 1000,
                        },
                    },
                ],
            }
            vi.useFakeTimers()
            vi.setSystemTime(1_000_000)
            const anchor = 1_000_000 - 30 * 60 * 1000
            Schedule.setSnapshot({
                phase: 'paused',
                currentPeriodIndex: 0,
                timestampStarted: anchor,
                timestampPaused: 1_000_000 - 10 * 60 * 1000, // paused 10 min ago
                timestampAnchor: anchor,
            })

            resumeTimer()

            expect(Schedule.isRunning.value).toBe(true)
            expect(Schedule.isAnchored.value).toBe(true)
            // anchored elapsed is clock-owned: 30 min since the anchor, the
            // 10-minute pause is NOT subtracted
            expect(currentPeriod.value.state.elapsed).toBe(30 * 60 * 1000)
        })
    })

    describe('auto-start when armed (idle + future anchor)', () => {
        it('schedules and fires startTimer exactly at the anchor time', () => {
            vi.useFakeTimers()
            vi.setSystemTime(1_000_000)
            Schedule.reset()

            Schedule.pin(1_000_000 + 30_000) // armed, 30s in the future

            expect(Schedule.phase.value).toBe('idle') // not yet

            vi.advanceTimersByTime(30_000)

            expect(Schedule.phase.value).toBe('running')
            expect(Schedule.timestampStarted.value).toBe(1_000_000 + 30_000)
        })

        it('does NOT auto-start when the anchor is already in the past (armed state reloaded late)', () => {
            vi.useFakeTimers()
            vi.setSystemTime(1_000_000)
            Schedule.reset()

            Schedule.pin(1_000_000 - 5_000) // already overdue

            vi.advanceTimersByTime(60_000)

            expect(Schedule.phase.value).toBe('idle')
        })

        it('clears the pending auto-start when the anchor is cleared before it fires', () => {
            vi.useFakeTimers()
            vi.setSystemTime(1_000_000)
            Schedule.reset()
            Schedule.pin(1_000_000 + 30_000)

            Schedule.reset() // unpins before the timeout fires

            vi.advanceTimersByTime(60_000)

            expect(Schedule.phase.value).toBe('idle')
        })

        it('clears the pending auto-start when the phase leaves idle before it fires', () => {
            vi.useFakeTimers()
            vi.setSystemTime(1_000_000)
            Schedule.reset()
            Schedule.pin(1_000_000 + 30_000)

            startTimer() // user starts manually before the scheduled moment

            const phaseAfterManualStart = Schedule.phase.value
            vi.advanceTimersByTime(60_000)

            // no second/duplicate start side effect from the stale timeout
            expect(Schedule.phase.value).toBe(phaseAfterManualStart)
        })
    })

    describe('applyCurrentDurations — @h:mm anchor line', () => {
        const NOW = new Date(2024, 0, 1, 10, 30, 0).getTime() // local 10:30

        beforeEach(() => {
            vi.useFakeTimers()
            vi.setSystemTime(NOW)
        })

        it('a valid (past/now) @h:mm line pins and reconciles — typed elapsed of the current period is ignored', () => {
            Schedule.setSnapshot({
                phase: 'paused',
                currentPeriodIndex: 0,
                timestampStarted: NOW - 60_000,
                timestampPaused: NOW,
                timestampAnchor: null,
            })

            // Anchor at 10:00 (30 min before "now", within the 60 min timeline);
            // typed elapsed is 5 min — if honored literally this would shift
            // timestampStarted to NOW - 5min, which must NOT happen while anchored.
            applyCurrentDurations('@10:00\nW 5/60 note')

            expect(Schedule.isAnchored.value).toBe(true)
            expect(msToMinutesSinceMidnight(Schedule.timestampAnchor.value)).toBe(10 * 60)
            // currentIndex is 0 so elapsedExceptCurrent is 0 -> timestampStarted == anchor
            expect(Schedule.timestampStarted.value).toBe(Schedule.timestampAnchor.value)
        })

        it('removing the @h:mm line unpins a previously anchored session', () => {
            Schedule.setSnapshot({
                phase: 'paused',
                currentPeriodIndex: 0,
                timestampStarted: NOW - 60_000,
                timestampPaused: NOW,
                timestampAnchor: NOW - 30 * 60 * 1000,
            })

            applyCurrentDurations('W 5/24 note')

            expect(Schedule.isAnchored.value).toBe(false)
        })

        it('a plain @h:mm later than now is INVALID — never silently yesterday (typo protection)', () => {
            Schedule.setSnapshot({
                phase: 'paused',
                currentPeriodIndex: 0,
                timestampStarted: NOW - 60_000,
                timestampPaused: NOW,
                timestampAnchor: null,
            })

            // 11:00 is after "now" (10:30). Adopting it as yesterday 11:00 would
            // inject 23.5 hours from one typo — instead the anchor state is left
            // unchanged and the typed elapsed is honored the normal way.
            applyCurrentDurations('@11:00\nW 5/24 note')

            expect(Schedule.isAnchored.value).toBe(false)
            expect(Schedule.timestampStarted.value).toBe(NOW - 5 * 60 * 1000)
        })

        it('a plain future @h:mm keeps the previous anchor when already anchored', () => {
            const previousAnchor = NOW - 10 * 60 * 1000 // 10:20
            Schedule.setSnapshot({
                phase: 'paused',
                currentPeriodIndex: 0,
                timestampStarted: previousAnchor,
                timestampPaused: NOW,
                timestampAnchor: previousAnchor,
            })

            applyCurrentDurations('@11:00\nW 5/24 note')

            expect(Schedule.timestampAnchor.value).toBe(previousAnchor)
        })

        it('shortly after midnight, crossing the day line requires the explicit @yesterday form', () => {
            const justPastMidnight = new Date(2024, 0, 2, 0, 30, 0).getTime()
            vi.setSystemTime(justPastMidnight)
            Schedule.setSnapshot({
                phase: 'paused',
                currentPeriodIndex: 0,
                timestampStarted: justPastMidnight - 60_000,
                timestampPaused: justPastMidnight,
                timestampAnchor: null,
            })

            // plain 23:50 would be later than 00:30 → invalid, not adopted
            applyCurrentDurations('@23:50\nW 5/60 note')
            expect(Schedule.isAnchored.value).toBe(false)

            // the explicit qualifier crosses the day line deterministically
            applyCurrentDurations('@yesterday 23:50\nW 5/60 note')
            expect(Schedule.timestampAnchor.value).toBe(new Date(2024, 0, 1, 23, 50).getTime())
        })

        it('an explicit @yesterday h:mm resolves to yesterday even when the time would fit today', () => {
            Schedule.setSnapshot({
                phase: 'paused',
                currentPeriodIndex: 0,
                timestampStarted: NOW - 60_000,
                timestampPaused: NOW,
                timestampAnchor: null,
            })

            // 9:00 already passed today (now is 10:30) — the qualifier forces yesterday
            applyCurrentDurations('@yesterday 9:00\nW 5/24 note')

            expect(Schedule.timestampAnchor.value).toBe(new Date(2023, 11, 31, 9, 0).getTime())
        })

        it('a day-qualified anchor (as the mirror serializes it) keeps a days-old session on its exact day', () => {
            const oldAnchor = new Date(2023, 11, 30, 9, 0).getTime() // 2 days before NOW
            Schedule.setSnapshot({
                phase: 'paused',
                currentPeriodIndex: 0,
                timestampStarted: oldAnchor,
                timestampPaused: NOW,
                timestampAnchor: oldAnchor,
            })

            // The mirror writes "@30 Dec 9:00" for this anchor — editing other
            // lines re-applies the same text and must not move the start
            applyCurrentDurations('@30 Dec 9:00\nW 5/24 note')

            expect(Schedule.timestampAnchor.value).toBe(oldAnchor)
        })

        it('removing the day qualifier deliberately re-resolves to the most recent occurrence', () => {
            const oldAnchor = new Date(2023, 11, 30, 9, 0).getTime()
            Schedule.setSnapshot({
                phase: 'paused',
                currentPeriodIndex: 0,
                timestampStarted: oldAnchor,
                timestampPaused: NOW,
                timestampAnchor: oldAnchor,
            })

            applyCurrentDurations('@9:00\nW 5/24 note')

            // plain 9:00 = today 9:00 (it already passed by 10:30)
            expect(Schedule.timestampAnchor.value).toBe(new Date(2024, 0, 1, 9, 0).getTime())
        })

        it('a typed anchor resolving into the same minute keeps the exact timestamp (seconds preserved)', () => {
            const anchorWithSeconds = NOW - 30 * 60 * 1000 + 25_000 // 10:00:25
            Schedule.setSnapshot({
                phase: 'paused',
                currentPeriodIndex: 0,
                timestampStarted: anchorWithSeconds,
                timestampPaused: NOW,
                timestampAnchor: anchorWithSeconds,
            })

            applyCurrentDurations('@10:00\nW 5/60 note')

            expect(Schedule.timestampAnchor.value).toBe(anchorWithSeconds)
        })

        it('the mirror serializes a yesterday anchor with its day qualifier', () => {
            const yesterdayAnchor = new Date(2023, 11, 31, 23, 50).getTime()
            Schedule.setSnapshot({
                phase: 'paused',
                currentPeriodIndex: 0,
                timestampStarted: yesterdayAnchor,
                timestampPaused: NOW,
                timestampAnchor: yesterdayAnchor,
            })

            editingCurrentDurations.value = true
            timerState.value = { ...timerState.value } // re-trigger the write-back effect

            expect(currentDurationsText.value.split('\n')[0]).toBe('@yesterday 23:50')

            editingCurrentDurations.value = false
        })

        it('an @h:mm line older than the total timeline duration is adopted — the last period will absorb the overrun', () => {
            Schedule.setSnapshot({
                phase: 'paused',
                currentPeriodIndex: 0,
                timestampStarted: NOW - 60_000,
                timestampPaused: NOW,
                timestampAnchor: null,
            })

            // 10:00 is 30 min before "now" and the typed timeline is only 24 min
            // long — the anchor is honored anyway; the catch-up on editor close
            // extends the last period so no time since 10:00 is lost.
            applyCurrentDurations('@10:00\nW 5/24 note')

            expect(Schedule.isAnchored.value).toBe(true)
            expect(msToMinutesSinceMidnight(Schedule.timestampAnchor.value)).toBe(10 * 60)
            expect(Schedule.timestampStarted.value).toBe(Schedule.timestampAnchor.value)
        })

        it('a too-old @h:mm line replaces the previous anchor when already anchored', () => {
            const previousAnchor = NOW - 10 * 60 * 1000 // 10:20
            Schedule.setSnapshot({
                phase: 'paused',
                currentPeriodIndex: 0,
                timestampStarted: previousAnchor,
                timestampPaused: NOW,
                timestampAnchor: previousAnchor,
            })

            // 9:00 is 90 min before "now" — older than the 24 min timeline, but
            // still a valid (past) start time and therefore adopted.
            applyCurrentDurations('@9:00\nW 5/24 note')

            expect(msToMinutesSinceMidnight(Schedule.timestampAnchor.value)).toBe(9 * 60)
        })

        it('a half-edited anchor line keeps the anchor (only a deleted line unpins)', () => {
            const previousAnchor = NOW - 30 * 60 * 1000 // 10:00
            Schedule.setSnapshot({
                phase: 'paused',
                currentPeriodIndex: 0,
                timestampStarted: previousAnchor,
                timestampPaused: NOW,
                timestampAnchor: previousAnchor,
            })

            // mid-keystroke states while editing the anchor line
            applyCurrentDurations('@10:\nW 5/60 note')
            expect(Schedule.timestampAnchor.value).toBe(previousAnchor)

            applyCurrentDurations('@\nW 5/60 note')
            expect(Schedule.timestampAnchor.value).toBe(previousAnchor)
        })

        it('an anchor newer than the past periods’ typed elapsed is invalid (record would contradict it)', () => {
            const previousAnchor = NOW - 90 * 60 * 1000 // 9:00
            Schedule.setSnapshot({
                phase: 'paused',
                currentPeriodIndex: 1,
                timestampStarted: NOW - 10 * 60 * 1000,
                timestampPaused: NOW,
                timestampAnchor: previousAnchor,
            })

            // period 0 records a full hour, so the session must have started at
            // 9:30 or earlier — @10:15 would drive the current period's derived
            // elapsed negative. Keep the previous anchor.
            applyCurrentDurations('@10:15\nW 1:00:00/60\nB 10/30')

            expect(Schedule.timestampAnchor.value).toBe(previousAnchor)
        })

        it('an anchor exactly at (reference − past elapsed) is still valid', () => {
            Schedule.setSnapshot({
                phase: 'paused',
                currentPeriodIndex: 1,
                timestampStarted: NOW - 10 * 60 * 1000,
                timestampPaused: NOW,
                timestampAnchor: null,
            })

            // 9:30 + 60 min recorded on period 0 = 10:30 = "now" → current
            // period's derived elapsed is exactly 0. Boundary case, valid.
            applyCurrentDurations('@9:30\nW 1:00:00/60\nB 10/30')

            expect(msToMinutesSinceMidnight(Schedule.timestampAnchor.value)).toBe(9 * 60 + 30)
            // timestampStarted = anchor + elapsedExceptCurrent = 9:30 + 1h = NOW
            expect(Schedule.timestampStarted.value).toBe(NOW)
        })

        it('the live-editor mirror includes the @h:mm line while anchored', () => {
            Schedule.setSnapshot({
                phase: 'idle',
                currentPeriodIndex: null,
                timestampStarted: null,
                timestampPaused: null,
                timestampAnchor: null,
            })
            timerState.value = {
                ...timerState.value,
                periods: timerState.value.periods.slice(0, 1),
            }

            pinTimer(NOW - 30 * 60 * 1000) // pins to 10:00

            editingCurrentDurations.value = true
            // touching timerState re-triggers the write-back effect
            timerState.value = { ...timerState.value }

            expect(currentDurationsText.value.split('\n')[0]).toBe('@10:00')

            editingCurrentDurations.value = false
        })
    })

    describe('applyActiveConfig / resetTimer — @h:mm config header arms the anchor', () => {
        const NOW = new Date(2024, 0, 1, 10, 30, 0).getTime()

        afterEach(() => {
            selectConfig(BUILTIN_CONFIG.id)
        })

        it('a config with an @h:mm header pins the anchor after applying it', () => {
            vi.useFakeTimers()
            vi.setSystemTime(NOW)

            const config = addConfig()
            updateConfigText(config.id, '@11:00\nW 24\nB 6')
            selectConfig(config.id)

            applyActiveConfig()

            expect(Schedule.isAnchored.value).toBe(true)
            expect(msToMinutesSinceMidnight(Schedule.timestampAnchor.value)).toBe(11 * 60)

            deleteConfig(config.id)
        })

        it('a config without an @h:mm header leaves the timeline unanchored', () => {
            const config = addConfig()
            updateConfigText(config.id, 'W 24\nB 6')
            selectConfig(config.id)

            applyActiveConfig()

            expect(Schedule.isAnchored.value).toBe(false)

            deleteConfig(config.id)
        })
    })
})
