// Pure functions for Period operations.
// No imports from signals, storage, sounds, or timer — fully mockless in tests.

// Internal helper: round a millisecond value down to the nearest whole minute.
// Returns { roundedDown, remainder }.
const roundDownToBaseMinute = timeInMs => {
    const oneMinute = 60 * 1000
    const roundedDown = Math.floor(timeInMs / oneMinute) * oneMinute
    const remainder = timeInMs - roundedDown
    return { roundedDown, remainder }
}

const applyElapsed = (period, newElapsedMs) => ({
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
const autoExtendDuration = (period, deltaMs) => {
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

// Completes a period by snapping elapsed down to a whole-minute boundary.
// Returns { period, remainder } where remainder is the sub-minute time that was
// not claimed — the caller should push this into the next period's timestampStarted
// so no real time is lost.
const complete = period => {
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
            finished: true,
        },
    }
    return { period: completed, remainder }
}

// Extends BOTH duration AND elapsed of an already-completed period by extraMs.
// Used when the user moves elapsed time backwards across a period boundary —
// the previous (completed) period absorbs the time transferred from the current one.
// state.remaining stays 0 and state.finished stays true.
// config (including userIntendedDuration) is never touched.
const absorbAsCompleted = (period, extraMs) => ({
    ...period,
    state: {
        ...period.state,
        duration: period.state.duration + extraMs,
        elapsed: period.state.elapsed + extraMs,
        remaining: 0,
        finished: true,
    },
})

// User-driven duration delta. Updates BOTH state.duration AND config.userIntendedDuration
// to the same new value (manual edits realign the two; auto-extension is the only thing
// that lets them diverge). Floors at state.elapsed so duration cannot shrink below time
// already lived. Recomputes state.remaining so the Period invariant holds in one step.
const extendDuration = (period, deltaMs) => {
    const duration = Math.max(period.state.elapsed, period.state.duration + deltaMs)
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

export const Period = {
    applyElapsed,
    autoExtendDuration,
    complete,
    absorbAsCompleted,
    extendDuration,
}
