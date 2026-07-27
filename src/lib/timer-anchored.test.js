import { describe, beforeEach, afterEach, it, expect, vi } from 'vitest'
import {
    timerState,
    initialState,
    pinTimer,
    unpinTimer,
    togglePinTimer,
    canTogglePin,
    reconcileToAnchor,
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
    adjustElapsed,
    adjustableElapsed,
    moveElapsedTimeToPreviousPeriod,
} from './timer'
import { getNextMultipleOf3Delta } from './snap'
import { Schedule } from './schedule'
import { PERIOD_CONFIG, MIN_PERIOD_MS } from './config'
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
// construct one for real. We only need postMessage to be a no-op; boundary
// behavior is exercised through the start/resume paths, which refresh the
// current period synchronously.
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

    describe('anchored boundary behavior — the current period extends, never auto-advances', () => {
        it('a mid-timeline period that overruns auto-extends; its successor is untouched', () => {
            vi.useFakeTimers()
            vi.setSystemTime(1_000_000)
            // anchor 25 min ago; period 0 is a 24-min work period with a successor
            const anchor = 1_000_000 - 25 * 60 * 1000
            Schedule.setSnapshot({
                phase: 'running',
                currentPeriodIndex: 0,
                timestampStarted: anchor,
                timestampPaused: null,
                timestampAnchor: anchor,
            })

            // drive a refresh through the editor pause/resume pair (tick is internal)
            pauseForEditing()
            resumeAfterEditing()

            expect(Schedule.currentPeriodIndex.value).toBe(0)
            expect(currentPeriod.value.state.elapsed).toBe(25 * 60 * 1000)
            expect(currentPeriod.value.state.duration).toBe(25 * 60 * 1000)
            // auto-extension leaves the user's intent untouched
            expect(currentPeriod.value.config.userIntendedDuration).toBe(24 * 60 * 1000)
            // the successor is not consumed
            expect(timerState.value.periods[1].state.elapsed).toBe(0)
            // invariant: total elapsed across all periods === now - anchor
            expect(timerDurationElapsed.value).toBe(Date.now() - anchor)
        })

        it('a gap spanning many planned periods still lands entirely on the current period', () => {
            vi.useFakeTimers()
            vi.setSystemTime(1_000_000)
            // 143 min gap over the default 24/6 timeline — nothing flows into successors
            const anchor = 1_000_000 - 143 * 60 * 1000
            Schedule.setSnapshot({
                phase: 'running',
                currentPeriodIndex: 0,
                timestampStarted: anchor,
                timestampPaused: null,
                timestampAnchor: anchor,
            })

            pauseForEditing()
            resumeAfterEditing()

            expect(Schedule.currentPeriodIndex.value).toBe(0)
            expect(currentPeriod.value.state.elapsed).toBe(143 * 60 * 1000)
            expect(currentPeriod.value.state.duration).toBe(143 * 60 * 1000)
            expect(timerState.value.periods[1].state.elapsed).toBe(0)
            expect(timerDurationElapsed.value).toBe(Date.now() - anchor)
        })

        it('a gap overrunning the whole timeline never self-finishes the timer', () => {
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
            // anchor 12 min ago: more than both 5-min periods together
            const anchor = 1_000_000 - 12 * 60 * 1000
            Schedule.setSnapshot({
                phase: 'running',
                currentPeriodIndex: 0,
                timestampStarted: anchor,
                timestampPaused: null,
                timestampAnchor: anchor,
            })

            pauseForEditing()
            resumeAfterEditing()

            expect(Schedule.isCompleted.value).toBe(false)
            expect(Schedule.isRunning.value).toBe(true)
            expect(Schedule.currentPeriodIndex.value).toBe(0)
            expect(currentPeriod.value.state.elapsed).toBe(12 * 60 * 1000)
            expect(currentPeriod.value.state.duration).toBe(12 * 60 * 1000)
            expect(currentPeriod.value.config.userIntendedDuration).toBe(5 * 60 * 1000)
            // invariant: every wall-clock minute since the anchor is recorded
            expect(timerDurationElapsed.value).toBe(Date.now() - anchor)
        })

        it('invariant holds after moveToPreviousPeriod while still anchored', () => {
            vi.useFakeTimers()
            vi.setSystemTime(1_000_000)
            // session: anchor 25 min ago, period 0 completed with 24 min, 1 min on period 1
            const anchor = 1_000_000 - 25 * 60 * 1000
            timerState.value = {
                ...timerState.value,
                periods: timerState.value.periods.map((p, i) =>
                    i === 0
                        ? { ...p, state: { ...p.state, elapsed: 24 * 60 * 1000, remaining: 0 } }
                        : p,
                ),
            }
            Schedule.setSnapshot({
                phase: 'running',
                currentPeriodIndex: 1,
                timestampStarted: 1_000_000 - 60 * 1000,
                timestampPaused: null,
                timestampAnchor: anchor,
            })

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

        it('resumeAfterEditing extends the current period and keeps running when remaining time ran out while editing', () => {
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

            // no self-finish — the current period stretches to cover the wall clock
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

    describe('adjustElapsed while anchored — transfer with the previous period', () => {
        // period 0 (prev, completed): 30 min recorded. period 1 (current): 0 min.
        // anchor + total elapsed (30 min) === reference, so anchor = NOW - 30 min.
        const NOW = 1_000_000
        const setupTwoPeriods = () => {
            vi.useFakeTimers()
            vi.setSystemTime(NOW)
            const anchor = NOW - 30 * 60 * 1000
            timerState.value = {
                ...timerState.value,
                periods: [
                    {
                        config: { type: 'work', note: '', userIntendedDuration: 30 * 60 * 1000 },
                        state: {
                            duration: 30 * 60 * 1000,
                            elapsed: 30 * 60 * 1000,
                            remaining: 0,
                        },
                    },
                    {
                        config: { type: 'break', note: '', userIntendedDuration: 60 * 60 * 1000 },
                        state: { duration: 60 * 60 * 1000, elapsed: 0, remaining: 60 * 60 * 1000 },
                    },
                ],
            }
            Schedule.setSnapshot({
                phase: 'running',
                currentPeriodIndex: 1,
                timestampStarted: NOW, // anchor + elapsedExceptCurrent(30min) = NOW
                timestampPaused: null,
                timestampAnchor: anchor,
            })
            return anchor
        }

        it('forward +10m shrinks the previous period and grows the current one', () => {
            const anchor = setupTwoPeriods()

            adjustElapsed(10 * 60 * 1000)

            expect(timerState.value.periods[0].state.duration).toBe(20 * 60 * 1000)
            expect(timerState.value.periods[0].state.elapsed).toBe(20 * 60 * 1000)
            expect(timerState.value.periods[0].config.userIntendedDuration).toBe(20 * 60 * 1000)
            expect(currentPeriod.value.state.elapsed).toBe(10 * 60 * 1000)
            expect(Schedule.timestampAnchor.value).toBe(anchor)
            expect(timerDurationElapsed.value).toBe(30 * 60 * 1000)
        })

        it('forward clamps at MIN_PERIOD_MS on the previous period', () => {
            const anchor = setupTwoPeriods()

            adjustElapsed(40 * 60 * 1000)

            expect(timerState.value.periods[0].state.duration).toBe(MIN_PERIOD_MS)
            expect(timerState.value.periods[0].state.elapsed).toBe(MIN_PERIOD_MS)
            expect(currentPeriod.value.state.elapsed).toBe(29 * 60 * 1000)
            expect(Schedule.timestampAnchor.value).toBe(anchor)
            expect(timerDurationElapsed.value).toBe(30 * 60 * 1000)
        })

        it('forward is a no-op when the previous period is already at MIN_PERIOD_MS', () => {
            const anchor = setupTwoPeriods()
            adjustElapsed(40 * 60 * 1000) // drive prev down to MIN first

            adjustElapsed(5 * 60 * 1000)

            expect(timerState.value.periods[0].state.elapsed).toBe(MIN_PERIOD_MS)
            expect(currentPeriod.value.state.elapsed).toBe(29 * 60 * 1000)
            expect(Schedule.timestampAnchor.value).toBe(anchor)
        })

        it('backward moves only what the current period has (clamped at 0)', () => {
            const anchor = setupTwoPeriods()
            adjustElapsed(10 * 60 * 1000) // prev 20m, current 10m

            adjustElapsed(-15 * 60 * 1000)

            expect(timerState.value.periods[0].state.duration).toBe(30 * 60 * 1000)
            expect(timerState.value.periods[0].state.elapsed).toBe(30 * 60 * 1000)
            expect(currentPeriod.value.state.elapsed).toBe(0)
            expect(Schedule.timestampAnchor.value).toBe(anchor)
            expect(timerDurationElapsed.value).toBe(30 * 60 * 1000)
        })

        it('anchored at index 0: both directions are a no-op and guards are false', () => {
            vi.useFakeTimers()
            vi.setSystemTime(NOW)
            const anchor = NOW - 5 * 60 * 1000
            Schedule.setSnapshot({
                phase: 'running',
                currentPeriodIndex: 0,
                timestampStarted: anchor,
                timestampPaused: null,
                timestampAnchor: anchor,
            })

            adjustElapsed(5 * 60 * 1000)
            expect(currentPeriod.value.state.elapsed).toBe(5 * 60 * 1000)
            expect(Schedule.timestampAnchor.value).toBe(anchor)

            adjustElapsed(-2 * 60 * 1000)
            expect(currentPeriod.value.state.elapsed).toBe(5 * 60 * 1000)
            expect(Schedule.timestampAnchor.value).toBe(anchor)

            expect(canAdjustElapsedForward.value).toBe(false)
            expect(canAdjustElapsedBackward.value).toBe(false)
        })

        it('forward transfer past current duration auto-extends the current period', () => {
            setupTwoPeriods()
            // shrink current period's own duration so the transfer overruns it
            timerState.value = {
                ...timerState.value,
                periods: timerState.value.periods.map((p, i) =>
                    i === 1
                        ? {
                              ...p,
                              state: {
                                  ...p.state,
                                  duration: 5 * 60 * 1000,
                                  remaining: 5 * 60 * 1000,
                              },
                          }
                        : p,
                ),
            }

            adjustElapsed(10 * 60 * 1000)

            expect(currentPeriod.value.state.elapsed).toBe(10 * 60 * 1000)
            expect(currentPeriod.value.state.duration).toBeGreaterThanOrEqual(
                currentPeriod.value.state.elapsed,
            )
        })

        it('forward then back is lossless — the overrun auto-extension is handed back', () => {
            // Regression: @9:00, W 30, F 30. At 10:16 the clock has driven the
            // current period to 46 elapsed / 47 duration (16 min of overrun).
            // Pushing +10 auto-extended it to 56; pulling -10 restored elapsed
            // but left duration at 57, silently inflating the plan and pushing
            // every projected clock time 10 min out.
            vi.useFakeTimers()
            const now = new Date(2026, 0, 1, 10, 16, 0).getTime()
            vi.setSystemTime(now)
            const anchor = new Date(2026, 0, 1, 9, 0, 0).getTime()
            timerState.value = {
                ...timerState.value,
                periods: [
                    {
                        config: { type: 'work', note: '', userIntendedDuration: 30 * 60 * 1000 },
                        state: { duration: 30 * 60 * 1000, elapsed: 30 * 60 * 1000, remaining: 0 },
                    },
                    {
                        config: { type: 'fun', note: '', userIntendedDuration: 30 * 60 * 1000 },
                        state: {
                            duration: 47 * 60 * 1000,
                            elapsed: 46 * 60 * 1000,
                            remaining: 60 * 1000,
                        },
                    },
                ],
            }
            Schedule.setSnapshot({
                phase: 'running',
                currentPeriodIndex: 1,
                timestampStarted: anchor + 30 * 60 * 1000,
                timestampPaused: null,
                timestampAnchor: anchor,
            })

            adjustElapsed(10 * 60 * 1000)
            adjustElapsed(-10 * 60 * 1000)

            expect(timerState.value.periods[0].state.elapsed).toBe(30 * 60 * 1000)
            expect(currentPeriod.value.state.elapsed).toBe(46 * 60 * 1000)
            expect(currentPeriod.value.state.duration).toBe(47 * 60 * 1000)
            expect(currentPeriod.value.config.userIntendedDuration).toBe(30 * 60 * 1000)
            expect(timerDurationElapsed.value).toBe(now - anchor)
        })

        it('back below the plan drops the auto-extension entirely', () => {
            setupTwoPeriods()
            // current period: 60 min plan, driven to 70 elapsed by the clock
            adjustElapsed(29 * 60 * 1000)
            timerState.value = {
                ...timerState.value,
                periods: timerState.value.periods.map((p, i) =>
                    i === 1 ? { ...p, state: { ...p.state, duration: 71 * 60 * 1000 } } : p,
                ),
            }

            adjustElapsed(-29 * 60 * 1000)

            expect(currentPeriod.value.state.elapsed).toBe(0)
            expect(currentPeriod.value.state.duration).toBe(60 * 60 * 1000)
            expect(currentPeriod.value.state.remaining).toBe(60 * 60 * 1000)
        })

        it('guard signals reflect the transfer semantics while anchored', () => {
            setupTwoPeriods()

            expect(canAdjustElapsedForward.value).toBe(true)
            expect(canAdjustElapsedBackward.value).toBe(false) // current elapsed is 0

            adjustElapsed(10 * 60 * 1000)

            expect(canAdjustElapsedBackward.value).toBe(true) // current elapsed > 0
        })
    })

    describe('adjustElapsed reference while anchored (plain arrow keys)', () => {
        // The plain ArrowLeft/ArrowRight handler in keyboard-shortcuts.jsx.
        const pressArrow = direction =>
            adjustElapsed(
                getNextMultipleOf3Delta({ currentMs: adjustableElapsed.value, direction }),
            )

        const M = 60 * 1000
        const S = 1000
        const START = new Date(2026, 0, 1, 0, 0, 0).getTime()
        const prevRecord = () => timerState.value.periods[0].state.elapsed

        // Anchored at 0:00; first period 60m recorded; current period at 30m
        // plus 24s of wall clock — anchored elapsed is clock-derived, so it
        // never sits on a whole minute.
        const setupWithClockSeconds = () => {
            vi.useFakeTimers()
            vi.setSystemTime(START + 90 * M + 24 * S)
            timerState.value = {
                ...timerState.value,
                periods: [
                    {
                        config: { type: 'work', note: '', userIntendedDuration: 60 * M },
                        state: { duration: 60 * M, elapsed: 60 * M, remaining: 0 },
                    },
                    {
                        config: { type: 'fun', note: '', userIntendedDuration: 60 * M },
                        state: {
                            duration: 60 * M,
                            elapsed: 30 * M + 24 * S,
                            remaining: 30 * M - 24 * S,
                        },
                    },
                ],
            }
            Schedule.setSnapshot({
                phase: 'running',
                currentPeriodIndex: 1,
                timestampStarted: START + 60 * M,
                timestampPaused: null,
                timestampAnchor: START,
            })
        }

        it('adjustableElapsed follows the current period while anchored, the total otherwise', () => {
            setupWithClockSeconds()

            // anchored: the current period's elapsed, floored to a whole minute
            expect(adjustableElapsed.value).toBe(30 * M)

            unpinTimer()

            // unanchored: shifting the start moves the session total 1:1
            expect(adjustableElapsed.value).toBe(timerDurationElapsed.value)
        })

        it('back then forward returns the previous period to where it started', () => {
            setupWithClockSeconds()
            const before = prevRecord()

            pressArrow('down')
            pressArrow('up')

            expect(prevRecord()).toBe(before)
        })

        it('every press moves whole minutes — the previous record never goes fractional', () => {
            setupWithClockSeconds()

            for (let i = 0; i < 10; i++) {
                pressArrow('down')
                expect(prevRecord() % M).toBe(0)
            }
        })

        it('pressing back repeatedly keeps stepping back, it does not re-trim the same seconds', () => {
            setupWithClockSeconds()
            const steps = []

            for (let i = 0; i < 3; i++) {
                const before = prevRecord()
                pressArrow('down')
                steps.push(prevRecord() - before)
            }

            expect(steps).toEqual([3 * M, 3 * M, 3 * M])
            // the current period keeps its clock seconds, on the 3-minute grid
            expect(currentPeriod.value.state.elapsed % (3 * M)).toBe(24 * S)
        })

        it('ten 1-minute steps back move exactly 10 minutes to the previous period', () => {
            vi.useFakeTimers()
            vi.setSystemTime(START + 90 * M)
            timerState.value = {
                ...timerState.value,
                periods: [
                    {
                        config: { type: 'work', note: '', userIntendedDuration: 60 * M },
                        state: { duration: 60 * M, elapsed: 60 * M, remaining: 0 },
                    },
                    {
                        config: { type: 'fun', note: '', userIntendedDuration: 60 * M },
                        state: { duration: 60 * M, elapsed: 30 * M, remaining: 30 * M },
                    },
                ],
            }
            Schedule.setSnapshot({
                phase: 'running',
                currentPeriodIndex: 1,
                timestampStarted: START + 60 * M,
                timestampPaused: null,
                timestampAnchor: START,
            })

            for (let i = 0; i < 10; i++) adjustElapsed(-1 * M)

            expect(Schedule.timestampAnchor.value).toBe(START) // start still 0:00
            expect(timerDurationElapsed.value).toBe(90 * M) // elapsed still 1:30
            expect(prevRecord()).toBe(70 * M) // 1:10 in the previous period
            expect(currentPeriod.value.state.elapsed).toBe(20 * M) // 20m in the current
        })
    })

    describe('moveElapsedTimeToPreviousPeriod while anchored — no double-count', () => {
        it('previous period grows by exactly the current elapsed, once', () => {
            vi.useFakeTimers()
            const NOW = 1_000_000
            vi.setSystemTime(NOW)
            const anchor = NOW - 40 * 60 * 1000
            timerState.value = {
                ...timerState.value,
                periods: [
                    {
                        config: { type: 'work', note: '', userIntendedDuration: 30 * 60 * 1000 },
                        state: {
                            duration: 30 * 60 * 1000,
                            elapsed: 30 * 60 * 1000,
                            remaining: 0,
                        },
                    },
                    {
                        config: { type: 'break', note: '', userIntendedDuration: 60 * 60 * 1000 },
                        state: {
                            duration: 60 * 60 * 1000,
                            elapsed: 10 * 60 * 1000,
                            remaining: 50 * 60 * 1000,
                        },
                    },
                ],
            }
            Schedule.setSnapshot({
                phase: 'running',
                currentPeriodIndex: 1,
                timestampStarted: NOW - 10 * 60 * 1000,
                timestampPaused: null,
                timestampAnchor: anchor,
            })

            moveElapsedTimeToPreviousPeriod()

            expect(timerState.value.periods[0].state.elapsed).toBe(40 * 60 * 1000)
            expect(currentPeriod.value.state.elapsed).toBe(0)
            expect(Schedule.timestampAnchor.value).toBe(anchor)
            expect(timerDurationElapsed.value).toBe(40 * 60 * 1000)
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

        it('a past anchor starts on period 0 with the whole gap as elapsed (no fast-forward)', () => {
            vi.useFakeTimers()
            vi.setSystemTime(1_000_000)
            Schedule.reset()
            const anchor = 1_000_000 - 25 * 60 * 1000 // 25 min in the past
            Schedule.pin(anchor)

            startTimer()

            // period 0 (24 min work) absorbs the full 25-min gap, auto-extended
            expect(Schedule.currentPeriodIndex.value).toBe(0)
            expect(currentPeriod.value.state.elapsed).toBe(25 * 60 * 1000)
            expect(currentPeriod.value.state.duration).toBe(25 * 60 * 1000)
            expect(currentPeriod.value.config.userIntendedDuration).toBe(24 * 60 * 1000)
            // the successor is untouched
            expect(timerState.value.periods[1].state.elapsed).toBe(0)
        })

        it('an anchor older than the whole timeline still starts on period 0 with all wall-clock time recorded', () => {
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

            // no instant self-finish — the timer is running on period 0,
            // extended to hold the whole hour since the anchor
            expect(Schedule.isCompleted.value).toBe(false)
            expect(Schedule.isRunning.value).toBe(true)
            expect(Schedule.currentPeriodIndex.value).toBe(0)
            expect(currentPeriod.value.state.elapsed).toBe(60 * 60 * 1000)
            expect(currentPeriod.value.state.duration).toBe(60 * 60 * 1000)
            expect(timerState.value.periods[1].state.elapsed).toBe(0)
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

        it('extends the current period (never advancing) when the clock overran it while paused', () => {
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
            // anchor 12 min ago — more than period 0's 5-min plan
            const anchor = 1_000_000 - 12 * 60 * 1000
            Schedule.setSnapshot({
                phase: 'paused',
                currentPeriodIndex: 0,
                timestampStarted: anchor,
                timestampPaused: 1_000_000 - 60_000,
                timestampAnchor: anchor,
            })

            resumeTimer()

            expect(Schedule.isRunning.value).toBe(true)
            expect(Schedule.currentPeriodIndex.value).toBe(0)
            expect(currentPeriod.value.state.elapsed).toBe(12 * 60 * 1000)
            expect(currentPeriod.value.state.duration).toBe(12 * 60 * 1000)
            expect(timerState.value.periods[1].state.elapsed).toBe(0)
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

        it('an @h:mm line older than the total timeline duration is adopted — the current period will absorb the overrun', () => {
            Schedule.setSnapshot({
                phase: 'paused',
                currentPeriodIndex: 0,
                timestampStarted: NOW - 60_000,
                timestampPaused: NOW,
                timestampAnchor: null,
            })

            // 10:00 is 30 min before "now" and the typed timeline is only 24 min
            // long — the anchor is honored anyway; on editor close the current
            // period extends to cover it, so no time since 10:00 is lost.
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
