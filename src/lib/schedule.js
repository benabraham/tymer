// Schedule owns the Timer's position-and-clock state.
// The four fields — phase, currentPeriodIndex, timestampStarted, timestampPaused — are
// hidden behind a private signal. External code reads via field/predicate/snapshot
// computeds and writes only through the named verbs.
//
// Schedule has no knowledge of Periods or period counts; invariants that require
// knowing the number of periods (e.g. "completed = last index") stay in timer.js.

import { signal, computed } from '@preact/signals'

// ---------------------------------------------------------------------------
// Private state — NOT exported
// ---------------------------------------------------------------------------

const state = signal({
    phase: 'idle', // 'idle' | 'running' | 'paused' | 'completed'
    currentPeriodIndex: null,
    timestampStarted: null,
    timestampPaused: null,
})

// ---------------------------------------------------------------------------
// Verbs — the only writers of `state`
// ---------------------------------------------------------------------------

// idle → running. Sets currentPeriodIndex=0, timestampStarted=now, clears
// timestampPaused. No-op if not idle.
const start = () => {
    if (state.value.phase !== 'idle') return

    state.value = {
        ...state.value,
        phase: 'running',
        currentPeriodIndex: 0,
        timestampStarted: Date.now(),
        timestampPaused: null,
    }
}

// running → paused. Records timestampPaused=now. No-op if not running.
const pause = () => {
    if (state.value.phase !== 'running') return

    state.value = {
        ...state.value,
        phase: 'paused',
        timestampPaused: Date.now(),
    }
}

// paused → running. Shifts timestampStarted forward by the pause duration so
// elapsed arithmetic is seamless. Clears timestampPaused. No-op if not paused.
const resume = () => {
    if (state.value.phase !== 'paused') return

    const durationPaused = Date.now() - state.value.timestampPaused

    state.value = {
        ...state.value,
        phase: 'running',
        timestampPaused: null,
        timestampStarted: state.value.timestampStarted + durationPaused,
    }
}

// any → idle. Clears all four fields to initial values.
const reset = () => {
    state.value = {
        phase: 'idle',
        currentPeriodIndex: null,
        timestampStarted: null,
        timestampPaused: null,
    }
}

// running | paused → completed. Clears timestampStarted and timestampPaused.
// currentPeriodIndex is kept — the caller (Timer composer) decides what index
// to preserve since Schedule cannot see periods.length.
const complete = () => {
    const { phase } = state.value
    if (phase !== 'running' && phase !== 'paused') return

    state.value = {
        ...state.value,
        phase: 'completed',
        timestampStarted: null,
        timestampPaused: null,
    }
}

// Advance to the next period (currentPeriodIndex += 1).
//
// Mirrors moveToNextPeriod in timer.js.  The reference point used for the
// new timestampStarted is (timestampPaused ?? Date.now()) — identical to the
// `(timerState.value.timestampPaused || Date.now())` sentinel in timer.js.
// This keeps elapsed-from-start correct whether the timer is running or paused
// at the moment advance() is called.
//
// timestampPaused is intentionally NOT cleared when paused (timer.js preserves
// it; the brief suggested clearing it, but that would break elapsed math).
//
// @param {number} remainderMs        Sub-minute remainder from Period.complete —
//                                    unclaimed time that carries into the new period.
// @param {number} nextPeriodElapsedMs Pre-existing elapsed on the incoming period
//                                    (e.g. a period that was visited before).
const advance = ({ remainderMs, nextPeriodElapsedMs }) => {
    const referenceNow = state.value.timestampPaused ?? Date.now()

    state.value = {
        ...state.value,
        currentPeriodIndex: state.value.currentPeriodIndex + 1,
        timestampStarted: referenceNow - nextPeriodElapsedMs - remainderMs,
        // timestampPaused deliberately left unchanged (see comment above)
    }
}

// Rewind to the previous period (currentPeriodIndex -= 1).
//
// Mirrors moveToPreviousPeriod in timer.js. The new timestampStarted is
// computed as: oldStart - prevElapsedMs + currentElapsedMs
// which simplifies to (timestampPaused ?? Date.now()) - prevElapsedMs,
// making the rewound period start with elapsed = prevElapsedMs.
//
// extensionMs is accepted for API consistency (the calling site extends the
// previous period's duration by this amount via Period operations) but it does
// NOT affect the timestamp calculation — timer.js never folds the extension
// into the elapsed/timestamp math, only into the Period's state.duration.
// timestampPaused is not modified (matching timer.js).
//
// @param {number} extensionMs       Duration added to the previous period (not
//                                   used in timestamp math — see above note).
// @param {number} prevElapsedMs     Elapsed on the period we're rewinding to.
// @param {number} currentElapsedMs  Elapsed on the period we're leaving.
const rewind = ({ extensionMs: _extensionMs, prevElapsedMs, currentElapsedMs }) => {
    const newTimestampStarted = state.value.timestampStarted - prevElapsedMs + currentElapsedMs

    state.value = {
        ...state.value,
        currentPeriodIndex: state.value.currentPeriodIndex - 1,
        timestampStarted: newTimestampStarted,
        // timestampPaused deliberately left unchanged (matching timer.js)
    }
}

// Shift timestampStarted by deltaMs (positive = forward, negative = backward).
// Used for elapsed adjustments. No-op if timestampStarted is null.
const shiftStartedAt = deltaMs => {
    if (state.value.timestampStarted === null) return

    state.value = {
        ...state.value,
        timestampStarted: state.value.timestampStarted + deltaMs,
    }
}

// Escape hatch: directly set currentPeriodIndex (e.g. after period array mutations).
const setIndex = index => {
    state.value = {
        ...state.value,
        currentPeriodIndex: index,
    }
}

// Hydration / test-fixture escape hatch: set all four fields at once.
// Used by storage hydration at boot (loadState path) and by timer-simple.test.js
// fixture setup to replace direct timerState.value mutations.
const setSnapshot = ({ phase, currentPeriodIndex, timestampStarted, timestampPaused }) => {
    state.value = { phase, currentPeriodIndex, timestampStarted, timestampPaused }
}

// Reset timestampStarted to (timestampPaused ?? Date.now()).
// Used by addPeriod when a new period is inserted before the current one and
// must begin with zero elapsed. No-op if timestampStarted is already null.
const restartCurrentPeriod = () => {
    if (state.value.timestampStarted === null) return

    state.value = {
        ...state.value,
        timestampStarted: state.value.timestampPaused ?? Date.now(),
    }
}

// ---------------------------------------------------------------------------
// Field computeds — read-only projections of the private state
// ---------------------------------------------------------------------------

const phase = computed(() => state.value.phase)
const currentPeriodIndex = computed(() => state.value.currentPeriodIndex)
const timestampStarted = computed(() => state.value.timestampStarted)
const timestampPaused = computed(() => state.value.timestampPaused)

// ---------------------------------------------------------------------------
// Predicate computeds
// ---------------------------------------------------------------------------

const isRunning = computed(() => state.value.phase === 'running')
const isPaused = computed(() => state.value.phase === 'paused')
const isIdle = computed(() => state.value.phase === 'idle')
const isCompleted = computed(() => state.value.phase === 'completed')

// ---------------------------------------------------------------------------
// Snapshot computed — four-field object for storage effect() subscriptions
// ---------------------------------------------------------------------------

const snapshot = computed(() => ({
    phase: state.value.phase,
    currentPeriodIndex: state.value.currentPeriodIndex,
    timestampStarted: state.value.timestampStarted,
    timestampPaused: state.value.timestampPaused,
}))

// ---------------------------------------------------------------------------
// Public surface
// ---------------------------------------------------------------------------

export const Schedule = {
    // verbs
    start,
    pause,
    resume,
    reset,
    complete,
    advance,
    rewind,
    shiftStartedAt,
    setIndex,
    setSnapshot,
    restartCurrentPeriod,
    // field computeds
    phase,
    currentPeriodIndex,
    timestampStarted,
    timestampPaused,
    // predicate computeds
    isRunning,
    isPaused,
    isIdle,
    isCompleted,
    // snapshot
    snapshot,
}
