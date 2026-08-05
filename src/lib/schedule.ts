// Schedule owns the Timer's position-and-clock state.
// The four fields — phase, currentPeriodIndex, timestampStarted, timestampPaused — are
// hidden behind a private signal. External code reads via field/predicate/snapshot
// computeds and writes only through the named verbs.
//
// Schedule has no knowledge of Periods or period counts; invariants that require
// knowing the number of periods (e.g. "completed = last index") stay in timer.js.

import { signal, computed, type ReadonlySignal } from '@preact/signals'

export type SchedulePhase = 'idle' | 'running' | 'paused' | 'completed'

type ScheduleState = {
    phase: SchedulePhase
    currentPeriodIndex: number | null
    timestampStarted: number | null
    timestampPaused: number | null
    timestampAnchor: number | null // epoch ms | null — set when the session is pinned to a wall-clock time
}

// The four-field (plus anchor) shape persisted by storage.ts's loadState/saveState
// — see CLAUDE.md's note that storage.ts's generics are wired up to this in a
// later phase.
export type ScheduleSnapshot = ScheduleState

// ---------------------------------------------------------------------------
// Private state — NOT exported
// ---------------------------------------------------------------------------

const state = signal<ScheduleState>({
    phase: 'idle',
    currentPeriodIndex: null,
    timestampStarted: null,
    timestampPaused: null,
    timestampAnchor: null,
})

// ---------------------------------------------------------------------------
// Verbs — the only writers of `state`
// ---------------------------------------------------------------------------

// idle → running. Sets currentPeriodIndex=0, timestampStarted=now (or the
// anchor, when pinned), clears timestampPaused. No-op if not idle.
const start = (): void => {
    if (state.value.phase !== 'idle') return

    state.value = {
        ...state.value,
        phase: 'running',
        currentPeriodIndex: 0,
        timestampStarted: state.value.timestampAnchor ?? Date.now(),
        timestampPaused: null,
    }
}

// Pins the session to a wall-clock timestamp. No phase restrictions — callers
// guard as needed.
const pin = (timestampMs: number): void => {
    state.value = { ...state.value, timestampAnchor: timestampMs }
}

// Clears the anchor.
const unpin = (): void => {
    state.value = { ...state.value, timestampAnchor: null }
}

// running → paused. Records timestampPaused=now. No-op if not running.
const pause = (): void => {
    if (state.value.phase !== 'running') return

    state.value = {
        ...state.value,
        phase: 'paused',
        timestampPaused: Date.now(),
    }
}

// paused → running. Shifts timestampStarted forward by the pause duration so
// elapsed arithmetic is seamless. Clears timestampPaused. No-op if not paused.
const resume = (): void => {
    if (state.value.phase !== 'paused') return

    // state.value.timestampPaused is non-null here — this branch is only
    // reached in the 'paused' phase, which is only ever entered by pause()
    // setting it.
    const durationPaused = Date.now() - (state.value.timestampPaused as number)

    state.value = {
        ...state.value,
        phase: 'running',
        timestampPaused: null,
        timestampStarted: (state.value.timestampStarted as number) + durationPaused,
    }
}

// any → idle. Clears all fields to initial values (including the anchor).
const reset = (): void => {
    state.value = {
        phase: 'idle',
        currentPeriodIndex: null,
        timestampStarted: null,
        timestampPaused: null,
        timestampAnchor: null,
    }
}

// running | paused → completed. Clears timestampStarted, timestampPaused, and
// timestampAnchor (a finished timer has no anchor). currentPeriodIndex is kept
// — the caller (Timer composer) decides what index to preserve since Schedule
// cannot see periods.length.
const complete = (): void => {
    const { phase } = state.value
    if (phase !== 'running' && phase !== 'paused') return

    state.value = {
        ...state.value,
        phase: 'completed',
        timestampStarted: null,
        timestampPaused: null,
        timestampAnchor: null,
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
// @param remainderMs        Sub-minute remainder from Period.complete —
//                            unclaimed time that carries into the new period.
// @param nextPeriodElapsedMs Pre-existing elapsed on the incoming period
//                             (e.g. a period that was visited before).
const advance = ({
    remainderMs,
    nextPeriodElapsedMs,
}: {
    remainderMs: number
    nextPeriodElapsedMs: number
}): void => {
    const referenceNow = state.value.timestampPaused ?? Date.now()

    state.value = {
        ...state.value,
        // currentPeriodIndex is non-null here — advance() is only ever called
        // once the session is running/paused, which sets it to a number.
        currentPeriodIndex: (state.value.currentPeriodIndex as number) + 1,
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
// @param extensionMs       Duration added to the previous period (not
//                           used in timestamp math — see above note).
// @param prevElapsedMs     Elapsed on the period we're rewinding to.
// @param currentElapsedMs  Elapsed on the period we're leaving.
const rewind = ({
    extensionMs: _extensionMs,
    prevElapsedMs,
    currentElapsedMs,
}: {
    extensionMs: number
    prevElapsedMs: number
    currentElapsedMs: number
}): void => {
    // timestampStarted is non-null here — rewind() is only ever called once
    // the session is running/paused, which sets it to a number.
    const newTimestampStarted =
        (state.value.timestampStarted as number) - prevElapsedMs + currentElapsedMs

    state.value = {
        ...state.value,
        // currentPeriodIndex is non-null here for the same reason as above.
        currentPeriodIndex: (state.value.currentPeriodIndex as number) - 1,
        timestampStarted: newTimestampStarted,
        // timestampPaused deliberately left unchanged (matching timer.js)
    }
}

// Shift timestampStarted by deltaMs (positive = forward, negative = backward).
// Used for elapsed adjustments. No-op if timestampStarted is null.
const shiftStartedAt = (deltaMs: number): void => {
    if (state.value.timestampStarted === null) return

    state.value = {
        ...state.value,
        timestampStarted: state.value.timestampStarted + deltaMs,
    }
}

// Escape hatch: directly set currentPeriodIndex (e.g. after period array mutations).
const setIndex = (index: number | null): void => {
    state.value = {
        ...state.value,
        currentPeriodIndex: index,
    }
}

// Hydration / test-fixture escape hatch: set all fields at once.
// Used by storage hydration at boot (loadState path) and by timer-simple.test.js
// fixture setup to replace direct timerState.value mutations.
// timestampAnchor defaults to null so existing 4-key callers keep working.
const setSnapshot = ({
    phase,
    currentPeriodIndex,
    timestampStarted,
    timestampPaused,
    timestampAnchor = null,
}: {
    phase: SchedulePhase
    currentPeriodIndex: number | null
    timestampStarted: number | null
    timestampPaused: number | null
    timestampAnchor?: number | null
}): void => {
    state.value = { phase, currentPeriodIndex, timestampStarted, timestampPaused, timestampAnchor }
}

// Reset timestampStarted to (timestampPaused ?? Date.now()).
// Used by addPeriod when a new period is inserted before the current one and
// must begin with zero elapsed. No-op if timestampStarted is already null.
const restartCurrentPeriod = (): void => {
    if (state.value.timestampStarted === null) return

    state.value = {
        ...state.value,
        timestampStarted: state.value.timestampPaused ?? Date.now(),
    }
}

// ---------------------------------------------------------------------------
// Field computeds — read-only projections of the private state
// ---------------------------------------------------------------------------

const phase: ReadonlySignal<SchedulePhase> = computed(() => state.value.phase)
const currentPeriodIndex: ReadonlySignal<number | null> = computed(
    () => state.value.currentPeriodIndex,
)
const timestampStarted: ReadonlySignal<number | null> = computed(() => state.value.timestampStarted)
const timestampPaused: ReadonlySignal<number | null> = computed(() => state.value.timestampPaused)
const timestampAnchor: ReadonlySignal<number | null> = computed(() => state.value.timestampAnchor)

// ---------------------------------------------------------------------------
// Predicate computeds
// ---------------------------------------------------------------------------

const isRunning: ReadonlySignal<boolean> = computed(() => state.value.phase === 'running')
const isPaused: ReadonlySignal<boolean> = computed(() => state.value.phase === 'paused')
const isIdle: ReadonlySignal<boolean> = computed(() => state.value.phase === 'idle')
const isCompleted: ReadonlySignal<boolean> = computed(() => state.value.phase === 'completed')
const isAnchored: ReadonlySignal<boolean> = computed(() => state.value.timestampAnchor != null)

// ---------------------------------------------------------------------------
// Snapshot computed — four-field object for storage effect() subscriptions
// ---------------------------------------------------------------------------

const snapshot: ReadonlySignal<ScheduleSnapshot> = computed(() => ({
    phase: state.value.phase,
    currentPeriodIndex: state.value.currentPeriodIndex,
    timestampStarted: state.value.timestampStarted,
    timestampPaused: state.value.timestampPaused,
    timestampAnchor: state.value.timestampAnchor,
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
    pin,
    unpin,
    // field computeds
    phase,
    currentPeriodIndex,
    timestampStarted,
    timestampPaused,
    timestampAnchor,
    // predicate computeds
    isRunning,
    isPaused,
    isIdle,
    isCompleted,
    isAnchored,
    // snapshot
    snapshot,
}
