import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { Schedule } from './schedule'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Reset Schedule back to idle before every test so each test starts clean.
// schedule.js does not export a way to reach the private signal directly, so
// we call reset() — the only verb that unconditionally clears all fields.
beforeEach(() => {
    Schedule.reset()
    vi.useRealTimers()
})

afterEach(() => {
    vi.useRealTimers()
})

// Convenience: read all four field computeds at once.
const snap = () => ({
    phase: Schedule.phase.value,
    currentPeriodIndex: Schedule.currentPeriodIndex.value,
    timestampStarted: Schedule.timestampStarted.value,
    timestampPaused: Schedule.timestampPaused.value,
})

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

describe('initial state', () => {
    it('phase is idle', () => {
        expect(Schedule.phase.value).toBe('idle')
    })

    it('currentPeriodIndex is null', () => {
        expect(Schedule.currentPeriodIndex.value).toBeNull()
    })

    it('timestampStarted is null', () => {
        expect(Schedule.timestampStarted.value).toBeNull()
    })

    it('timestampPaused is null', () => {
        expect(Schedule.timestampPaused.value).toBeNull()
    })

    it('isIdle is true; all other predicates are false', () => {
        expect(Schedule.isIdle.value).toBe(true)
        expect(Schedule.isRunning.value).toBe(false)
        expect(Schedule.isPaused.value).toBe(false)
        expect(Schedule.isCompleted.value).toBe(false)
    })
})

// ---------------------------------------------------------------------------
// start()
// ---------------------------------------------------------------------------

describe('Schedule.start()', () => {
    it('idle → running: sets phase, index=0, timestampStarted, clears timestampPaused', () => {
        vi.useFakeTimers()
        vi.setSystemTime(1_000_000)

        Schedule.start()

        expect(Schedule.phase.value).toBe('running')
        expect(Schedule.currentPeriodIndex.value).toBe(0)
        expect(Schedule.timestampStarted.value).toBe(1_000_000)
        expect(Schedule.timestampPaused.value).toBeNull()
    })

    it('isRunning becomes true after start()', () => {
        Schedule.start()
        expect(Schedule.isRunning.value).toBe(true)
        expect(Schedule.isIdle.value).toBe(false)
    })

    it('no-op if already running (double-start is idempotent)', () => {
        vi.useFakeTimers()
        vi.setSystemTime(1_000_000)
        Schedule.start()

        vi.setSystemTime(2_000_000)
        Schedule.start() // should be ignored

        // timestampStarted must still be the first call's timestamp
        expect(Schedule.timestampStarted.value).toBe(1_000_000)
        expect(Schedule.currentPeriodIndex.value).toBe(0)
    })

    it('no-op if paused', () => {
        Schedule.start()
        Schedule.pause()
        const before = snap()
        Schedule.start()
        expect(snap()).toEqual(before)
    })

    it('no-op if completed', () => {
        Schedule.start()
        Schedule.complete()
        const before = snap()
        Schedule.start()
        expect(snap()).toEqual(before)
    })
})

// ---------------------------------------------------------------------------
// pause()
// ---------------------------------------------------------------------------

describe('Schedule.pause()', () => {
    it('running → paused: sets timestampPaused', () => {
        vi.useFakeTimers()
        vi.setSystemTime(1_000_000)
        Schedule.start()

        vi.setSystemTime(1_060_000) // 60 s later
        Schedule.pause()

        expect(Schedule.phase.value).toBe('paused')
        expect(Schedule.timestampPaused.value).toBe(1_060_000)
    })

    it('isPaused becomes true; isRunning becomes false', () => {
        Schedule.start()
        Schedule.pause()
        expect(Schedule.isPaused.value).toBe(true)
        expect(Schedule.isRunning.value).toBe(false)
    })

    it('invariant: timestampPaused !== null after pause()', () => {
        Schedule.start()
        Schedule.pause()
        expect(Schedule.timestampPaused.value).not.toBeNull()
    })

    it('invariant: timestampStarted still set after pause()', () => {
        Schedule.start()
        Schedule.pause()
        expect(Schedule.timestampStarted.value).not.toBeNull()
    })

    it('no-op if idle', () => {
        const before = snap()
        Schedule.pause()
        expect(snap()).toEqual(before)
    })

    it('no-op if already paused (double-pause)', () => {
        vi.useFakeTimers()
        vi.setSystemTime(1_000_000)
        Schedule.start()

        vi.setSystemTime(1_060_000)
        Schedule.pause()
        const afterFirst = snap()

        vi.setSystemTime(1_120_000)
        Schedule.pause()

        // second pause must not change timestampPaused
        expect(snap()).toEqual(afterFirst)
    })

    it('no-op if completed', () => {
        Schedule.start()
        Schedule.complete()
        const before = snap()
        Schedule.pause()
        expect(snap()).toEqual(before)
    })
})

// ---------------------------------------------------------------------------
// resume()
// ---------------------------------------------------------------------------

describe('Schedule.resume()', () => {
    it('paused → running: clears timestampPaused, shifts timestampStarted forward', () => {
        vi.useFakeTimers()
        vi.setSystemTime(1_000_000)
        Schedule.start()

        vi.setSystemTime(1_060_000) // run 60 s
        Schedule.pause()

        vi.setSystemTime(1_120_000) // pause for 60 s
        Schedule.resume()

        expect(Schedule.phase.value).toBe('running')
        expect(Schedule.timestampPaused.value).toBeNull()
        // pauseDuration = 1_120_000 - 1_060_000 = 60_000
        // newStart = 1_000_000 + 60_000 = 1_060_000
        expect(Schedule.timestampStarted.value).toBe(1_060_000)
    })

    it('elapsed from start is preserved across pause+resume', () => {
        vi.useFakeTimers()
        vi.setSystemTime(1_000_000)
        Schedule.start()

        vi.setSystemTime(1_030_000) // 30 s elapsed
        Schedule.pause()

        vi.setSystemTime(1_090_000) // paused 60 s
        Schedule.resume()

        // After resume, elapsed since new start = Date.now() - newStart
        // newStart = 1_000_000 + 60_000 = 1_060_000
        // elapsed = 1_090_000 - 1_060_000 = 30_000 ✓ (same as when paused)
        const elapsed = Date.now() - Schedule.timestampStarted.value
        expect(elapsed).toBe(30_000)
    })

    it('isRunning becomes true after resume()', () => {
        Schedule.start()
        Schedule.pause()
        Schedule.resume()
        expect(Schedule.isRunning.value).toBe(true)
        expect(Schedule.isPaused.value).toBe(false)
    })

    it('no-op if idle', () => {
        const before = snap()
        Schedule.resume()
        expect(snap()).toEqual(before)
    })

    it('no-op if running', () => {
        vi.useFakeTimers()
        vi.setSystemTime(1_000_000)
        Schedule.start()
        const before = snap()

        vi.setSystemTime(2_000_000)
        Schedule.resume() // should be ignored
        expect(snap()).toEqual(before)
    })

    it('no-op if completed', () => {
        Schedule.start()
        Schedule.complete()
        const before = snap()
        Schedule.resume()
        expect(snap()).toEqual(before)
    })
})

// ---------------------------------------------------------------------------
// reset()
// ---------------------------------------------------------------------------

describe('Schedule.reset()', () => {
    it('from any phase returns to idle with all fields cleared', () => {
        const phases = [
            () => {
                /* idle already */
            },
            () => Schedule.start(),
            () => {
                Schedule.start()
                Schedule.pause()
            },
            () => {
                Schedule.start()
                Schedule.complete()
            },
        ]

        for (const setup of phases) {
            setup()
            Schedule.reset()
            expect(Schedule.phase.value).toBe('idle')
            expect(Schedule.currentPeriodIndex.value).toBeNull()
            expect(Schedule.timestampStarted.value).toBeNull()
            expect(Schedule.timestampPaused.value).toBeNull()
            Schedule.reset() // next iteration starts fresh
        }
    })

    it('isIdle true after reset from running', () => {
        Schedule.start()
        Schedule.reset()
        expect(Schedule.isIdle.value).toBe(true)
    })

    it('isIdle true after reset from paused', () => {
        Schedule.start()
        Schedule.pause()
        Schedule.reset()
        expect(Schedule.isIdle.value).toBe(true)
    })
})

// ---------------------------------------------------------------------------
// complete()
// ---------------------------------------------------------------------------

describe('Schedule.complete()', () => {
    it('running → completed: clears timestamps, keeps currentPeriodIndex', () => {
        vi.useFakeTimers()
        vi.setSystemTime(1_000_000)
        Schedule.start()
        Schedule.setIndex(3) // simulate being on period 3

        Schedule.complete()

        expect(Schedule.phase.value).toBe('completed')
        expect(Schedule.currentPeriodIndex.value).toBe(3)
        expect(Schedule.timestampStarted.value).toBeNull()
        expect(Schedule.timestampPaused.value).toBeNull()
    })

    it('paused → completed: clears both timestamps', () => {
        Schedule.start()
        Schedule.pause()
        Schedule.complete()

        expect(Schedule.phase.value).toBe('completed')
        expect(Schedule.timestampStarted.value).toBeNull()
        expect(Schedule.timestampPaused.value).toBeNull()
    })

    it('isCompleted becomes true', () => {
        Schedule.start()
        Schedule.complete()
        expect(Schedule.isCompleted.value).toBe(true)
        expect(Schedule.isRunning.value).toBe(false)
    })

    it('no-op if idle', () => {
        const before = snap()
        Schedule.complete()
        expect(snap()).toEqual(before)
    })

    it('no-op if already completed', () => {
        Schedule.start()
        Schedule.complete()
        const before = snap()
        Schedule.complete()
        expect(snap()).toEqual(before)
    })
})

// ---------------------------------------------------------------------------
// advance()
// ---------------------------------------------------------------------------

describe('Schedule.advance()', () => {
    it('bumps currentPeriodIndex by 1', () => {
        vi.useFakeTimers()
        vi.setSystemTime(1_000_000)
        Schedule.start()
        expect(Schedule.currentPeriodIndex.value).toBe(0)

        Schedule.advance({ remainderMs: 0, nextPeriodElapsedMs: 0 })
        expect(Schedule.currentPeriodIndex.value).toBe(1)
    })

    it('running: timestampStarted = Date.now() - remainderMs - nextPeriodElapsedMs', () => {
        vi.useFakeTimers()
        vi.setSystemTime(1_000_000)
        Schedule.start()

        vi.setSystemTime(1_200_000) // 200 s later — we'll advance here
        Schedule.advance({ remainderMs: 15_000, nextPeriodElapsedMs: 30_000 })

        // referenceNow = Date.now() = 1_200_000 (not paused)
        // newStart = 1_200_000 - 30_000 - 15_000 = 1_155_000
        expect(Schedule.timestampStarted.value).toBe(1_155_000)
    })

    it('running: new elapsed = nextPeriodElapsedMs + remainderMs at the instant of advance', () => {
        vi.useFakeTimers()
        vi.setSystemTime(1_000_000)
        Schedule.start()

        const remainderMs = 15_000
        const nextPeriodElapsedMs = 30_000

        vi.setSystemTime(1_200_000)
        Schedule.advance({ remainderMs, nextPeriodElapsedMs })

        const elapsedAfterAdvance = Date.now() - Schedule.timestampStarted.value
        expect(elapsedAfterAdvance).toBe(remainderMs + nextPeriodElapsedMs)
    })

    it('paused: referenceNow = timestampPaused, timestampPaused is preserved', () => {
        vi.useFakeTimers()
        vi.setSystemTime(1_000_000)
        Schedule.start()

        vi.setSystemTime(1_060_000)
        Schedule.pause()
        const pausedAt = Schedule.timestampPaused.value // 1_060_000

        vi.setSystemTime(1_120_000) // wall clock moves but we are paused
        Schedule.advance({ remainderMs: 5_000, nextPeriodElapsedMs: 10_000 })

        // referenceNow = timestampPaused = 1_060_000 (NOT Date.now())
        // newStart = 1_060_000 - 10_000 - 5_000 = 1_045_000
        expect(Schedule.timestampStarted.value).toBe(1_045_000)
        // timestampPaused must NOT be cleared (phase stays paused)
        expect(Schedule.timestampPaused.value).toBe(pausedAt)
        expect(Schedule.phase.value).toBe('paused')
    })

    it('paused: elapsed at the paused instant = referenceNow - newStart = remainderMs + nextPeriodElapsedMs', () => {
        vi.useFakeTimers()
        vi.setSystemTime(1_000_000)
        Schedule.start()

        vi.setSystemTime(1_060_000)
        Schedule.pause()

        const remainderMs = 5_000
        const nextPeriodElapsedMs = 10_000

        vi.setSystemTime(1_120_000)
        Schedule.advance({ remainderMs, nextPeriodElapsedMs })

        // Paused elapsed = timestampPaused - timestampStarted
        const elapsedWhenPaused = Schedule.timestampPaused.value - Schedule.timestampStarted.value
        expect(elapsedWhenPaused).toBe(remainderMs + nextPeriodElapsedMs)
    })

    it('zero remainder and zero nextPeriodElapsed: newStart = referenceNow', () => {
        vi.useFakeTimers()
        vi.setSystemTime(1_000_000)
        Schedule.start()

        vi.setSystemTime(1_200_000)
        Schedule.advance({ remainderMs: 0, nextPeriodElapsedMs: 0 })

        expect(Schedule.timestampStarted.value).toBe(1_200_000)
    })
})

// ---------------------------------------------------------------------------
// rewind()
// ---------------------------------------------------------------------------

describe('Schedule.rewind()', () => {
    it('decrements currentPeriodIndex by 1', () => {
        vi.useFakeTimers()
        vi.setSystemTime(1_000_000)
        Schedule.start()
        Schedule.advance({ remainderMs: 0, nextPeriodElapsedMs: 0 })
        expect(Schedule.currentPeriodIndex.value).toBe(1)

        Schedule.rewind({ extensionMs: 0, prevElapsedMs: 0, currentElapsedMs: 0 })
        expect(Schedule.currentPeriodIndex.value).toBe(0)
    })

    it('running: timestampStarted = oldStart - prevElapsedMs + currentElapsedMs', () => {
        vi.useFakeTimers()
        vi.setSystemTime(1_000_000)
        Schedule.start()

        // Simulate being on period 1 with period 0 having elapsed 120_000 ms
        Schedule.setIndex(1)
        // Manually fix timestampStarted to a known value
        // We'll fake that the current elapsed of period 1 is 20_000 ms
        // i.e. timestampStarted = Date.now() - 20_000 = 1_000_000 - 20_000 = 980_000
        // But we can only get there by using shiftStartedAt...
        // Instead, let's set time so the elapsed is known.
        vi.setSystemTime(1_020_000) // 20 s since start → currentElapsedMs = 20_000

        const prevElapsedMs = 120_000
        const currentElapsedMs = 20_000

        Schedule.rewind({ extensionMs: 12_000, prevElapsedMs, currentElapsedMs })

        // oldStart = 1_000_000
        // newStart = 1_000_000 - 120_000 + 20_000 = 900_000
        expect(Schedule.timestampStarted.value).toBe(900_000)
    })

    it('running: elapsed of rewound period = prevElapsedMs at the instant of rewind', () => {
        vi.useFakeTimers()
        vi.setSystemTime(1_000_000)
        Schedule.start()
        Schedule.setIndex(1)

        vi.setSystemTime(1_020_000)
        const prevElapsedMs = 120_000
        const currentElapsedMs = 20_000

        Schedule.rewind({ extensionMs: 0, prevElapsedMs, currentElapsedMs })

        const elapsedAfterRewind = Date.now() - Schedule.timestampStarted.value
        expect(elapsedAfterRewind).toBe(prevElapsedMs)
    })

    it('paused: timestampStarted adjusted correctly, timestampPaused preserved', () => {
        vi.useFakeTimers()
        vi.setSystemTime(1_000_000)
        Schedule.start()
        Schedule.setIndex(1)

        vi.setSystemTime(1_020_000)
        Schedule.pause()
        const pausedAt = Schedule.timestampPaused.value // 1_020_000

        const prevElapsedMs = 120_000
        const currentElapsedMs = 20_000

        vi.setSystemTime(1_080_000) // wall time moves while paused
        Schedule.rewind({ extensionMs: 0, prevElapsedMs, currentElapsedMs })

        // oldStart = 1_000_000, newStart = 1_000_000 - 120_000 + 20_000 = 900_000
        expect(Schedule.timestampStarted.value).toBe(900_000)
        expect(Schedule.timestampPaused.value).toBe(pausedAt)
        expect(Schedule.phase.value).toBe('paused')
    })

    it('paused: elapsed at paused instant = timestampPaused - newStart = prevElapsedMs', () => {
        vi.useFakeTimers()
        vi.setSystemTime(1_000_000)
        Schedule.start()
        Schedule.setIndex(1)

        vi.setSystemTime(1_020_000)
        Schedule.pause()

        const prevElapsedMs = 120_000
        const currentElapsedMs = 20_000

        Schedule.rewind({ extensionMs: 0, prevElapsedMs, currentElapsedMs })

        const pausedElapsed = Schedule.timestampPaused.value - Schedule.timestampStarted.value
        expect(pausedElapsed).toBe(prevElapsedMs)
    })

    it('extensionMs does not affect timestamp math (accepted but unused)', () => {
        vi.useFakeTimers()
        vi.setSystemTime(1_000_000)
        const prevElapsedMs = 60_000
        const currentElapsedMs = 20_000

        // Run A: extensionMs = 0
        Schedule.start()
        Schedule.setIndex(2)
        vi.setSystemTime(1_020_000)
        Schedule.rewind({ extensionMs: 0, prevElapsedMs, currentElapsedMs })
        const resultA = Schedule.timestampStarted.value

        // Run B: extensionMs = 99_000, identical other params and timing
        Schedule.reset()
        vi.setSystemTime(1_000_000) // identical start time
        Schedule.start()
        Schedule.setIndex(2)
        vi.setSystemTime(1_020_000) // identical rewind time
        Schedule.rewind({ extensionMs: 99_000, prevElapsedMs, currentElapsedMs })
        const resultB = Schedule.timestampStarted.value

        expect(resultA).toBe(resultB)
    })
})

// ---------------------------------------------------------------------------
// shiftStartedAt()
// ---------------------------------------------------------------------------

describe('Schedule.shiftStartedAt()', () => {
    it('shifts timestampStarted by positive deltaMs', () => {
        vi.useFakeTimers()
        vi.setSystemTime(1_000_000)
        Schedule.start()
        const before = Schedule.timestampStarted.value

        Schedule.shiftStartedAt(5_000)
        expect(Schedule.timestampStarted.value).toBe(before + 5_000)
    })

    it('shifts timestampStarted by negative deltaMs', () => {
        vi.useFakeTimers()
        vi.setSystemTime(1_000_000)
        Schedule.start()
        const before = Schedule.timestampStarted.value

        Schedule.shiftStartedAt(-10_000)
        expect(Schedule.timestampStarted.value).toBe(before - 10_000)
    })

    it('no-op if timestampStarted is null (idle state)', () => {
        // idle — timestampStarted is null
        Schedule.shiftStartedAt(5_000)
        expect(Schedule.timestampStarted.value).toBeNull()
    })

    it('no-op if timestampStarted is null (completed state)', () => {
        Schedule.start()
        Schedule.complete()
        // complete() clears timestampStarted
        Schedule.shiftStartedAt(5_000)
        expect(Schedule.timestampStarted.value).toBeNull()
    })

    it('zero delta leaves value unchanged', () => {
        vi.useFakeTimers()
        vi.setSystemTime(1_000_000)
        Schedule.start()
        const before = Schedule.timestampStarted.value

        Schedule.shiftStartedAt(0)
        expect(Schedule.timestampStarted.value).toBe(before)
    })
})

// ---------------------------------------------------------------------------
// setIndex()
// ---------------------------------------------------------------------------

describe('Schedule.setIndex()', () => {
    it('sets currentPeriodIndex to the provided value', () => {
        Schedule.start()
        Schedule.setIndex(5)
        expect(Schedule.currentPeriodIndex.value).toBe(5)
    })

    it('can set to 0', () => {
        Schedule.start()
        Schedule.setIndex(3)
        Schedule.setIndex(0)
        expect(Schedule.currentPeriodIndex.value).toBe(0)
    })

    it('can set to null (escape hatch)', () => {
        Schedule.start()
        Schedule.setIndex(null)
        expect(Schedule.currentPeriodIndex.value).toBeNull()
    })

    it('does not change any other field', () => {
        vi.useFakeTimers()
        vi.setSystemTime(1_000_000)
        Schedule.start()
        const beforePhase = Schedule.phase.value
        const beforeTs = Schedule.timestampStarted.value
        const beforeTp = Schedule.timestampPaused.value

        Schedule.setIndex(7)

        expect(Schedule.phase.value).toBe(beforePhase)
        expect(Schedule.timestampStarted.value).toBe(beforeTs)
        expect(Schedule.timestampPaused.value).toBe(beforeTp)
    })
})

// ---------------------------------------------------------------------------
// snapshot computed
// ---------------------------------------------------------------------------

describe('Schedule.snapshot', () => {
    it('returns an object with the four expected keys', () => {
        const s = Schedule.snapshot.value
        expect(s).toHaveProperty('phase')
        expect(s).toHaveProperty('currentPeriodIndex')
        expect(s).toHaveProperty('timestampStarted')
        expect(s).toHaveProperty('timestampPaused')
    })

    it('reflects the current state in idle', () => {
        expect(Schedule.snapshot.value).toEqual({
            phase: 'idle',
            currentPeriodIndex: null,
            timestampStarted: null,
            timestampPaused: null,
        })
    })

    it('reflects the current state after start()', () => {
        vi.useFakeTimers()
        vi.setSystemTime(1_234_567)
        Schedule.start()

        expect(Schedule.snapshot.value).toEqual({
            phase: 'running',
            currentPeriodIndex: 0,
            timestampStarted: 1_234_567,
            timestampPaused: null,
        })
    })

    it('snapshot and individual field computeds are in sync', () => {
        vi.useFakeTimers()
        vi.setSystemTime(1_000_000)
        Schedule.start()

        vi.setSystemTime(1_060_000)
        Schedule.pause()

        const s = Schedule.snapshot.value
        expect(s.phase).toBe(Schedule.phase.value)
        expect(s.currentPeriodIndex).toBe(Schedule.currentPeriodIndex.value)
        expect(s.timestampStarted).toBe(Schedule.timestampStarted.value)
        expect(s.timestampPaused).toBe(Schedule.timestampPaused.value)
    })
})

// ---------------------------------------------------------------------------
// Predicate computeds
// ---------------------------------------------------------------------------

describe('predicate computeds', () => {
    it('isIdle true only when phase=idle', () => {
        expect(Schedule.isIdle.value).toBe(true)
        Schedule.start()
        expect(Schedule.isIdle.value).toBe(false)
        Schedule.reset()
        expect(Schedule.isIdle.value).toBe(true)
    })

    it('isRunning true only when phase=running', () => {
        expect(Schedule.isRunning.value).toBe(false)
        Schedule.start()
        expect(Schedule.isRunning.value).toBe(true)
        Schedule.pause()
        expect(Schedule.isRunning.value).toBe(false)
        Schedule.resume()
        expect(Schedule.isRunning.value).toBe(true)
    })

    it('isPaused true only when phase=paused', () => {
        expect(Schedule.isPaused.value).toBe(false)
        Schedule.start()
        expect(Schedule.isPaused.value).toBe(false)
        Schedule.pause()
        expect(Schedule.isPaused.value).toBe(true)
        Schedule.resume()
        expect(Schedule.isPaused.value).toBe(false)
    })

    it('isCompleted true only when phase=completed', () => {
        expect(Schedule.isCompleted.value).toBe(false)
        Schedule.start()
        expect(Schedule.isCompleted.value).toBe(false)
        Schedule.complete()
        expect(Schedule.isCompleted.value).toBe(true)
        Schedule.reset()
        expect(Schedule.isCompleted.value).toBe(false)
    })
})

// ---------------------------------------------------------------------------
// Invariants
// ---------------------------------------------------------------------------

describe('invariants', () => {
    it('running ⇒ timestampStarted !== null', () => {
        Schedule.start()
        expect(Schedule.phase.value).toBe('running')
        expect(Schedule.timestampStarted.value).not.toBeNull()
    })

    it('paused ⇒ timestampPaused !== null AND timestampStarted !== null', () => {
        Schedule.start()
        Schedule.pause()
        expect(Schedule.phase.value).toBe('paused')
        expect(Schedule.timestampPaused.value).not.toBeNull()
        expect(Schedule.timestampStarted.value).not.toBeNull()
    })

    it('idle ⇒ currentPeriodIndex === null AND timestampStarted === null AND timestampPaused === null', () => {
        Schedule.start()
        Schedule.pause()
        Schedule.reset()
        expect(Schedule.phase.value).toBe('idle')
        expect(Schedule.currentPeriodIndex.value).toBeNull()
        expect(Schedule.timestampStarted.value).toBeNull()
        expect(Schedule.timestampPaused.value).toBeNull()
    })

    it('completed ⇒ timestampStarted === null AND timestampPaused === null', () => {
        Schedule.start()
        Schedule.complete()
        expect(Schedule.phase.value).toBe('completed')
        expect(Schedule.timestampStarted.value).toBeNull()
        expect(Schedule.timestampPaused.value).toBeNull()
    })

    it('complete() from paused clears both timestamps', () => {
        Schedule.start()
        Schedule.pause()
        Schedule.complete()
        expect(Schedule.timestampStarted.value).toBeNull()
        expect(Schedule.timestampPaused.value).toBeNull()
    })
})

// ---------------------------------------------------------------------------
// setSnapshot()
// ---------------------------------------------------------------------------

describe('Schedule.setSnapshot()', () => {
    it('sets all four fields at once', () => {
        Schedule.setSnapshot({
            phase: 'running',
            currentPeriodIndex: 2,
            timestampStarted: 1_500_000,
            timestampPaused: null,
        })

        expect(Schedule.phase.value).toBe('running')
        expect(Schedule.currentPeriodIndex.value).toBe(2)
        expect(Schedule.timestampStarted.value).toBe(1_500_000)
        expect(Schedule.timestampPaused.value).toBeNull()
    })

    it('field computeds reflect the new snapshot immediately', () => {
        Schedule.setSnapshot({
            phase: 'paused',
            currentPeriodIndex: 1,
            timestampStarted: 2_000_000,
            timestampPaused: 2_060_000,
        })

        expect(Schedule.isPaused.value).toBe(true)
        expect(Schedule.isRunning.value).toBe(false)
        expect(Schedule.currentPeriodIndex.value).toBe(1)
        expect(Schedule.timestampStarted.value).toBe(2_000_000)
        expect(Schedule.timestampPaused.value).toBe(2_060_000)
    })

    it('snapshot computed mirrors the written values', () => {
        const input = {
            phase: 'completed',
            currentPeriodIndex: null,
            timestampStarted: null,
            timestampPaused: null,
        }
        Schedule.setSnapshot(input)
        expect(Schedule.snapshot.value).toEqual(input)
    })

    it('can restore idle state', () => {
        Schedule.start()
        Schedule.setSnapshot({
            phase: 'idle',
            currentPeriodIndex: null,
            timestampStarted: null,
            timestampPaused: null,
        })
        expect(Schedule.isIdle.value).toBe(true)
        expect(Schedule.currentPeriodIndex.value).toBeNull()
    })
})

// ---------------------------------------------------------------------------
// restartCurrentPeriod()
// ---------------------------------------------------------------------------

describe('Schedule.restartCurrentPeriod()', () => {
    it('running: sets timestampStarted = Date.now()', () => {
        vi.useFakeTimers()
        vi.setSystemTime(1_000_000)
        Schedule.start()

        vi.setSystemTime(1_060_000) // 60 s later
        Schedule.restartCurrentPeriod()

        // timestampStarted = timestampPaused ?? Date.now() = Date.now() = 1_060_000
        expect(Schedule.timestampStarted.value).toBe(1_060_000)
    })

    it('paused: sets timestampStarted = timestampPaused', () => {
        vi.useFakeTimers()
        vi.setSystemTime(1_000_000)
        Schedule.start()

        vi.setSystemTime(1_060_000)
        Schedule.pause() // timestampPaused = 1_060_000

        vi.setSystemTime(1_120_000) // wall clock moves
        Schedule.restartCurrentPeriod()

        // timestampStarted = timestampPaused = 1_060_000 (NOT Date.now())
        expect(Schedule.timestampStarted.value).toBe(1_060_000)
        // phase still paused, timestampPaused preserved
        expect(Schedule.phase.value).toBe('paused')
        expect(Schedule.timestampPaused.value).toBe(1_060_000)
    })

    it('no-op if timestampStarted is null (idle)', () => {
        Schedule.restartCurrentPeriod()
        expect(Schedule.timestampStarted.value).toBeNull()
    })

    it('no-op if timestampStarted is null (completed)', () => {
        Schedule.start()
        Schedule.complete()
        Schedule.restartCurrentPeriod()
        expect(Schedule.timestampStarted.value).toBeNull()
    })

    it('does not modify currentPeriodIndex or phase', () => {
        vi.useFakeTimers()
        vi.setSystemTime(1_000_000)
        Schedule.start()
        Schedule.setIndex(3)
        const beforePhase = Schedule.phase.value
        const beforeIndex = Schedule.currentPeriodIndex.value

        Schedule.restartCurrentPeriod()

        expect(Schedule.phase.value).toBe(beforePhase)
        expect(Schedule.currentPeriodIndex.value).toBe(beforeIndex)
    })
})

// ---------------------------------------------------------------------------
// Full lifecycle walkthrough
// ---------------------------------------------------------------------------

describe('full lifecycle', () => {
    it('idle → running → paused → running → completed → idle', () => {
        vi.useFakeTimers()
        vi.setSystemTime(1_000_000)

        // start
        Schedule.start()
        expect(Schedule.phase.value).toBe('running')
        expect(Schedule.currentPeriodIndex.value).toBe(0)

        // advance to period 1
        vi.setSystemTime(1_120_000)
        Schedule.advance({ remainderMs: 10_000, nextPeriodElapsedMs: 0 })
        expect(Schedule.currentPeriodIndex.value).toBe(1)

        // pause
        vi.setSystemTime(1_180_000)
        Schedule.pause()
        expect(Schedule.isPaused.value).toBe(true)

        // resume
        vi.setSystemTime(1_240_000)
        Schedule.resume()
        expect(Schedule.isRunning.value).toBe(true)

        // complete
        Schedule.complete()
        expect(Schedule.isCompleted.value).toBe(true)
        expect(Schedule.currentPeriodIndex.value).toBe(1)

        // reset
        Schedule.reset()
        expect(Schedule.isIdle.value).toBe(true)
        expect(Schedule.currentPeriodIndex.value).toBeNull()
    })
})
