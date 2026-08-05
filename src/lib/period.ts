// Pure functions for Period operations.
// No imports from signals, storage, sounds, or timer — fully mockless in tests.
// Lifecycle (Past / Current / Future) is NEVER stored — always derived from
// index vs currentPeriodIndex at the call site.

import { MIN_PERIOD_MS } from './config.js'

// The three kinds of Period a session can contain — work / break / fun.
export type PeriodType = 'work' | 'break' | 'fun'

export type PeriodConfigData = {
    type: PeriodType
    note: string
    userIntendedDuration: number
}

export type PeriodStateData = {
    duration: number
    elapsed: number
    remaining: number
}

// The plain-object shape operated on by the Period namespace below. Named
// `PeriodData` (rather than `Period`) to avoid colliding with the `Period`
// value export (the namespace of ops) — see CLAUDE.md's "Period Configuration"
// section for the conceptual shape this mirrors.
export type PeriodData = {
    config: PeriodConfigData
    state: PeriodStateData
}

// Internal helper: round a millisecond value down to the nearest whole minute.
// Returns { roundedDown, remainder }.
const roundDownToBaseMinute = (timeInMs: number): { roundedDown: number; remainder: number } => {
    const oneMinute = 60 * 1000
    const roundedDown = Math.floor(timeInMs / oneMinute) * oneMinute
    const remainder = timeInMs - roundedDown
    return { roundedDown, remainder }
}

const applyElapsed = (period: PeriodData, newElapsedMs: number): PeriodData => ({
    ...period,
    state: {
        ...period.state,
        elapsed: newElapsedMs,
        remaining: Math.max(0, period.state.duration - newElapsedMs),
    },
})

// Auto-extension after overrun. Grows duration by at least `deltaMs`,
// but never leaves duration < elapsed (which would make the elapsed bar
// overflow the period block visually until later ticks catch up).
// Recomputes remaining so the Period invariant holds in one step.
const autoExtendDuration = (period: PeriodData, deltaMs: number): PeriodData => {
    const duration = Math.max(period.state.duration + deltaMs, period.state.elapsed)
    return {
        ...period,
        state: {
            ...period.state,
            duration,
            remaining: Math.max(0, duration - period.state.elapsed),
        },
    }
}

// Winds auto-extension back DOWN after elapsed shrinks (the user moved elapsed
// time back to the previous period). Auto-extension is a consequence of
// overrunning, not a user intent — so once the elapsed that earned it is gone,
// state.duration returns to the user's plan (config.userIntendedDuration).
// Never goes below elapsed (the elapsed bar would overflow the block) nor below
// MIN_PERIOD_MS, and never GROWS duration — that stays autoExtendDuration's job.
// config.userIntendedDuration is never touched.
const relaxAutoExtension = (period: PeriodData): PeriodData => {
    const duration = Math.max(
        MIN_PERIOD_MS,
        period.config.userIntendedDuration,
        period.state.elapsed,
    )
    if (duration >= period.state.duration) return period

    return {
        ...period,
        state: {
            ...period.state,
            duration,
            remaining: Math.max(0, duration - period.state.elapsed),
        },
    }
}

// Completes a period by snapping elapsed to a whole-minute boundary.
// When elapsed >= MIN_PERIOD_MS: round DOWN to the nearest minute (remainder
// is positive — caller backdates the next period's start so no time is lost).
// When elapsed < MIN_PERIOD_MS: snap UP to MIN_PERIOD_MS so no past period
// is ever shorter than the floor (remainder is negative — caller pushes the
// next period's start forward to "pay back" the credited time).
const complete = (period: PeriodData): { period: PeriodData; remainder: number } => {
    if (period.state.elapsed < MIN_PERIOD_MS) {
        const completed = {
            ...period,
            config: { ...period.config, userIntendedDuration: MIN_PERIOD_MS },
            state: {
                ...period.state,
                duration: MIN_PERIOD_MS,
                elapsed: MIN_PERIOD_MS,
                remaining: 0,
            },
        }
        return { period: completed, remainder: period.state.elapsed - MIN_PERIOD_MS }
    }

    const { roundedDown, remainder } = roundDownToBaseMinute(period.state.elapsed)
    const completed = {
        ...period,
        config: {
            ...period.config,
            userIntendedDuration: roundedDown,
        },
        state: {
            ...period.state,
            duration: roundedDown,
            elapsed: roundedDown,
            remaining: 0,
        },
    }
    return { period: completed, remainder }
}

// Extends BOTH duration AND elapsed of a Past period by extraMs.
// Used when the user moves elapsed time backwards across a period boundary —
// the previous (Past) period absorbs the time transferred from the current one.
// state.remaining stays 0.
// config (including userIntendedDuration) is never touched.
const absorbAsCompleted = (period: PeriodData, extraMs: number): PeriodData => ({
    ...period,
    state: {
        ...period.state,
        duration: period.state.duration + extraMs,
        elapsed: period.state.elapsed + extraMs,
        remaining: 0,
    },
})

// Shifts the period's length by deltaMs when its START moves — the boundary with
// the previous period slid, so the duration must follow one-for-one to leave the
// period's END where it was (state.remaining, and therefore the projected clock
// time, is unchanged).
// Unlike extendDuration this moves state.duration and config.userIntendedDuration
// by the same delta INSTEAD of collapsing them to one value: any auto-extension
// gap between them survives the move, which also makes the move exactly
// reversible. Both are floored at MIN_PERIOD_MS.
// No elapsed-floor — the caller shifts elapsed by the same delta, so the
// duration >= elapsed invariant carries over on its own.
const shiftDuration = (period: PeriodData, deltaMs: number): PeriodData => {
    const duration = Math.max(MIN_PERIOD_MS, period.state.duration + deltaMs)
    return {
        ...period,
        config: {
            ...period.config,
            userIntendedDuration: Math.max(
                MIN_PERIOD_MS,
                period.config.userIntendedDuration + deltaMs,
            ),
        },
        state: {
            ...period.state,
            duration,
            remaining: Math.max(0, duration - period.state.elapsed),
        },
    }
}

// User-driven duration delta. Updates BOTH state.duration AND config.userIntendedDuration
// to the same new value (manual edits realign the two; auto-extension is the only thing
// that lets them diverge). Floors at state.elapsed so duration cannot shrink below time
// already lived, and at MIN_PERIOD_MS so periods are never shorter than the floor.
// Recomputes state.remaining so the Period invariant holds in one step.
const extendDuration = (period: PeriodData, deltaMs: number): PeriodData => {
    const duration = Math.max(MIN_PERIOD_MS, period.state.elapsed, period.state.duration + deltaMs)
    return {
        ...period,
        config: {
            ...period.config,
            userIntendedDuration: duration,
        },
        state: {
            ...period.state,
            duration,
            remaining: Math.max(0, duration - period.state.elapsed),
        },
    }
}

// Constructs a brand-new Period from scratch.
// Returns { config: { type, note, userIntendedDuration }, state: { duration, elapsed: 0, remaining } }.
// Lifecycle (Past / Current / Future) is derived from position, never stored.
// Clamps durationMs to MIN_PERIOD_MS so a period can never be created shorter than the floor.
const create = ({
    type,
    note,
    durationMs,
}: {
    type: PeriodType
    note: string
    durationMs: number
}): PeriodData => {
    const duration = Math.max(MIN_PERIOD_MS, durationMs)
    return {
        config: {
            type,
            note,
            userIntendedDuration: duration,
        },
        state: {
            duration,
            elapsed: 0,
            remaining: duration,
        },
    }
}

// Produces a fresh Period from an existing PeriodConfig, resetting state to initial.
// Uses config.userIntendedDuration as the source of truth for the fresh duration,
// clamped to MIN_PERIOD_MS in case persisted state was below the floor.
const unstarted = (config: PeriodConfigData): PeriodData => {
    const duration = Math.max(MIN_PERIOD_MS, config.userIntendedDuration)
    return {
        config: { ...config, userIntendedDuration: duration },
        state: {
            duration,
            elapsed: 0,
            remaining: duration,
        },
    }
}

// Sets the planned duration for a Current or Future Period.
// Updates BOTH config.userIntendedDuration AND state.duration to ms.
// Recomputes state.remaining = max(0, ms - state.elapsed), preserving elapsed.
// Floors at state.elapsed (cannot shrink below time already lived) and
// at MIN_PERIOD_MS (periods are never shorter than the floor).
const setPlannedDuration = (period: PeriodData, ms: number): PeriodData => {
    const duration = Math.max(MIN_PERIOD_MS, period.state.elapsed, ms)
    return {
        ...period,
        config: {
            ...period.config,
            userIntendedDuration: duration,
        },
        state: {
            ...period.state,
            duration,
            remaining: Math.max(0, duration - period.state.elapsed),
        },
    }
}

// Amends the recorded duration for a Past Period.
// Overwrites the recording: state.elapsed = duration = ms, state.remaining = 0.
// Also updates config.userIntendedDuration = ms to keep config and state aligned.
// No elapsed-floor — the caller is rewriting the historical record outright — but
// floored at MIN_PERIOD_MS so the past record cannot be set shorter than the floor.
const amendRecordedDuration = (period: PeriodData, ms: number): PeriodData => {
    const duration = Math.max(MIN_PERIOD_MS, ms)
    return {
        ...period,
        config: {
            ...period.config,
            userIntendedDuration: duration,
        },
        state: {
            ...period.state,
            duration,
            elapsed: duration,
            remaining: 0,
        },
    }
}

// Returns a new Period with only config.type changed. Everything else is preserved.
const setType = (period: PeriodData, type: PeriodType): PeriodData => ({
    ...period,
    config: {
        ...period.config,
        type,
    },
})

// Returns a new Period with only config.note changed. Everything else is preserved.
const setNote = (period: PeriodData, note: string): PeriodData => ({
    ...period,
    config: {
        ...period.config,
        note,
    },
})

export const Period = {
    applyElapsed,
    autoExtendDuration,
    relaxAutoExtension,
    complete,
    absorbAsCompleted,
    shiftDuration,
    extendDuration,
    setPlannedDuration,
    amendRecordedDuration,
    create,
    unstarted,
    setType,
    setNote,
}
