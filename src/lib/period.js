// Pure functions for Period operations.
// No imports from signals, storage, sounds, or timer — fully mockless in tests.

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

export const Period = { applyElapsed, autoExtendDuration }
