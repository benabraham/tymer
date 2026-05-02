import { signal, effect, computed, batch } from '@preact/signals'
import { saveState, loadState } from './storage'
import { playSound, playTimerFinishedSound, playPeriodSound, getSoundKeyFromPath } from './sounds'
import { log } from './log.js'
import { PERIOD_CONFIG, UI_UPDATE_INTERVAL, DURATION_TO_ADD_AUTOMATICALLY } from './config.js'
import { SoundScheduler } from './sound-scheduler'
import { AVAILABLE_SOUNDS } from './sound-discovery'
import { Period } from './period'

// merge a partial { config?, state? } update into an existing Period
const mergePeriod = (period, partial) => ({
    ...period,
    ...(partial.config && { config: { ...period.config, ...partial.config } }),
    ...(partial.state && { state: { ...period.state, ...partial.state } }),
})

// default timer configuration
export const initialState = {
    currentPeriodIndex: null, // track current period
    phase: 'idle', // lifecycle phase: 'idle' | 'running' | 'paused' | 'completed'
    timestampPaused: null, // timestamp when timer was paused (data for clock arithmetic)
    timestampStarted: null, // timestamp when timer was started
    types: ['work', 'break', 'fun'],
    periods: PERIOD_CONFIG.map(({ duration, type, note }) =>
        Period.create({ type, note, durationMs: duration }),
    ),
}

// timer state signal, initialized from localStorage or defaults
export const timerState = signal(loadState(initialState))

// Initialize sound scheduler for period-based sounds
const soundScheduler = new SoundScheduler(5000, AVAILABLE_SOUNDS)

// Timer worker for accurate timing even when tab is backgrounded
let timerWorker = null

// Initialize worker
const initWorker = () => {
    if (!timerWorker) {
        timerWorker = new Worker('/tymer/timer-worker.js')
        timerWorker.onmessage = event => {
            // Worker sends timestamp, trigger our tick function
            tick()
        }
    }
    return timerWorker
}

// computed signals
export const timerHasFinished = computed(() => timerState.value.phase === 'completed')
export const currentPeriod = computed(
    () => timerState.value.periods[timerState.value.currentPeriodIndex],
)
// computed signals for timer.jsx
export const timerOnLastPeriod = computed(
    () => timerState.value.currentPeriodIndex + 1 >= timerState.value.periods.length,
)
export const timerDuration = computed(() =>
    timerState.value.periods.reduce((sum, period) => sum + period.state.duration, 0),
)
export const timerDurationElapsed = computed(() =>
    timerState.value.periods.reduce((sum, period) => sum + period.state.elapsed, 0),
)
export const timerDurationRemaining = computed(() =>
    timerState.value.periods.reduce((sum, period) => sum + period.state.remaining, 0),
)
export const shouldGoToNextPeriod = computed(
    () =>
        currentPeriod.value
        && currentPeriod.value.state.duration !== currentPeriod.value.config.userIntendedDuration,
)

// check if periods have been modified from initial configuration
export const periodsModifiedFromInitial = computed(() => {
    const currentPeriods = timerState.value.periods
    const initialPeriods = initialState.periods

    if (currentPeriods.length !== initialPeriods.length) return true

    return currentPeriods.some((period, index) => {
        const initialPeriod = initialPeriods[index]
        return (
            period.config.type !== initialPeriod.config.type
            || period.config.note !== initialPeriod.config.note
            || period.state.duration !== initialPeriod.state.duration
        )
    })
})

// ============================================================================
// Validation Signals and Functions - Single Source of Truth for UI/Keyboard
// ============================================================================

// Computed signals for simple boolean checks (no parameters)
export const canStartPause = computed(
    () => !timerHasFinished.value && timerDurationRemaining.value > 0,
)

export const canReset = computed(
    () =>
        !(
            (!periodsModifiedFromInitial.value
                && !timerState.value.timestampStarted
                && timerDurationRemaining.value !== 0)
            || (timerState.value.currentPeriodIndex === null
                && !timerHasFinished.value
                && !periodsModifiedFromInitial.value)
        ),
)

export const canMoveToNextPeriod = computed(
    () =>
        !timerHasFinished.value
        && timerState.value.currentPeriodIndex !== null
        && !timerOnLastPeriod.value,
)

export const canMoveToPreviousPeriod = computed(
    () =>
        !timerHasFinished.value
        && timerState.value.currentPeriodIndex !== null
        && timerState.value.currentPeriodIndex > 0,
)

export const canFinishTimer = computed(
    () =>
        !timerHasFinished.value
        && timerState.value.currentPeriodIndex !== null
        && timerDurationElapsed.value >= 1 * 60 * 1000,
)

export const canAdjustElapsedForward = computed(() => timerState.value.currentPeriodIndex !== null)

export const canAdjustElapsedBackward = computed(
    () => timerState.value.currentPeriodIndex !== null && timerDurationElapsed.value > 0,
)

export const canAdjustDurationForward = computed(
    () => !timerHasFinished.value && timerState.value.currentPeriodIndex !== null,
)

export const canChangeType = computed(() => timerState.value.currentPeriodIndex !== null)

export const canAddPeriod = computed(() => timerState.value.currentPeriodIndex !== null)

export const canRemovePeriod = computed(
    () => timerState.value.currentPeriodIndex !== null && timerState.value.periods.length > 1,
)

export const canMoveElapsedToPrevious = computed(
    () =>
        timerState.value.currentPeriodIndex !== null
        && timerDurationElapsed.value > 0
        && timerState.value.currentPeriodIndex > 0,
)

// Validation functions for parameterized checks
export const canAdjustElapsed = amount => {
    if (timerState.value.currentPeriodIndex === null) return false
    if (amount < 0 && timerDurationElapsed.value === 0) return false
    return true
}

export const canAdjustDuration = amount => {
    if (timerHasFinished.value || timerState.value.currentPeriodIndex === null) {
        return false
    }
    if (amount < 0) {
        if (!timerState.value.periods.some(p => p.state.remaining > 0)) {
            return false
        }
        return currentPeriod.value.state.remaining >= Math.abs(amount)
    }
    return true
}

// Helper for rounding to multiples of 3
export const getNextMultipleOf3Delta = (currentMs, direction) => {
    const currentMinutes = Math.floor(currentMs / (60 * 1000))
    const target =
        direction === 'up'
            ? Math.ceil((currentMinutes + 1) / 3) * 3
            : Math.floor((currentMinutes - 1) / 3) * 3
    return target * 60 * 1000 - currentMs
}

// ============================================================================

// prepares timer for use, continuing an running timer or prepare a new one
export const initializeTimer = () => {
    console.clear()
    log('initializeTimer', timerState.value, 2)

    // nothing more to do if timer has finished or is paused
    if (timerHasFinished.value || timerState.value.phase === 'paused') return

    if (timerState.value.phase === 'running') {
        // continue (restart) the timer if it was running
        updateCurrentPeriod()
        startTick()
    } else {
        // prepare a new timer (reset runtime state but preserve period customizations)
        initializeTimerState()
    }
}

// initialize timer state preserving period customizations but resetting runtime state
const initializeTimerState = () => {
    stopTick()

    // Clear all sound windows before resetting state

    // Reset only runtime properties, preserve existing periods
    updateTimerState({
        timerProperties: {
            currentPeriodIndex: null,
            phase: 'idle',
            timestampPaused: null,
            timestampStarted: null,
        },
    })

    console.clear()
    log('timer initialized (periods preserved)', timerState.value, 7)
}

// starts repeating the tick function using worker to update UI periodically
const startTick = () => {
    const worker = initWorker()
    worker.postMessage('start')
}

// stops repeating the tick function
const stopTick = () => {
    if (timerWorker) {
        timerWorker.postMessage('stop')
    }
}

// cleanup worker when no longer needed
export const cleanupWorker = () => {
    if (timerWorker) {
        timerWorker.postMessage('stop')
        timerWorker.terminate()
        timerWorker = null
    }
}

// starts the timer
export const startTimer = () => {
    if (timerHasFinished.value) return // do nothing if timer has finished (needs reset)

    playSound('button')

    updateTimerState({
        timerProperties: {
            currentPeriodIndex: 0,
            phase: 'running',
            timestampStarted: Date.now(),
        },
    })

    updateCurrentPeriod()

    startTick()

    log('started timer', timerState.value, 3)
}

// resumes the timer after it was paused
export const resumeTimer = () => {
    if (timerHasFinished.value) return // do nothing if timer has finished (needs reset)

    playSound('button')

    const durationPaused = Date.now() - timerState.value.timestampPaused

    updateTimerState({
        timerProperties: {
            phase: 'running',
            timestampPaused: null,
            // adjust the start time for the pause duration
            timestampStarted: timerState.value.timestampStarted + durationPaused,
        },
    })

    updateCurrentPeriod()

    startTick()

    log('resumed timer', timerState.value, 13)
}

// pauses the timer
export const pauseTimer = () => {
    if (timerHasFinished.value) return // do nothing if timer has finished (needs reset)

    playSound('button')

    updateTimerState({
        timerProperties: { phase: 'paused', timestampPaused: Date.now() },
    })

    stopTick()

    updateCurrentPeriod()

    log('timer paused', timerState.value, 8)
}

// resets timer to the initial state
export const resetTimer = () => {
    stopTick()

    timerState.value = { ...initialState }

    console.clear()
    log('timer reset', timerState.value, 7)
}

// adjusts the duration of period (user-driven manual edit)
export const adjustDuration = durationDelta => {
    // nothing to do if timer has finished or there is no current period
    if (timerHasFinished.value || timerState.value.currentPeriodIndex === null) return

    // Ensure elapsed is fresh so the elapsed-floor in extendDuration uses the right value
    updateCurrentPeriod()

    const extended = Period.extendDuration(currentPeriod.value, durationDelta)

    updateTimerState({
        currentPeriodProperties: {
            config: { userIntendedDuration: extended.config.userIntendedDuration },
            state: { duration: extended.state.duration, remaining: extended.state.remaining },
        },
    })

    // Notify sound scheduler of duration change
    soundScheduler.onDurationChange()

    log('duration adjusted', timerState.value, 9)
}

// adjusts elapsed time
export const adjustElapsed = elapsedDelta => {
    // nothing to do if timer has finished or there is no current period
    if (timerState.value.currentPeriodIndex === null) return

    updateCurrentPeriod()

    updateTimerState({
        timerProperties: {
            timestampStarted:
                timerState.value.timestampStarted
                + Math.min(
                    // prevents elapsed to go negative
                    currentPeriod.value.state.elapsed,
                    -elapsedDelta,
                ),
        },
    })

    updateCurrentPeriod()

    // Notify sound scheduler of elapsed time change
    const newElapsed = currentPeriod.value.state.elapsed
    const oldElapsed = newElapsed - elapsedDelta
    soundScheduler.onElapsedAdjustment(newElapsed, oldElapsed)

    log('time adjusted', timerState.value, 6)
}

// update (recalculate) period related values

// calculate elapsed and remaining time for the current period
const calculatePeriodTimes = (timestampStarted, timestampPaused, periodDuration) => {
    const timeToCalculateWith = timestampPaused || Date.now()
    const periodDurationElapsed = Math.max(0, timeToCalculateWith - timestampStarted)
    const periodDurationRemaining = Math.max(0, periodDuration - periodDurationElapsed)

    return {
        periodDurationElapsed,
        periodDurationRemaining,
    }
}

// check if the period has elapsed
const hasPeriodReachedCompletion = (periodDurationElapsed, periodDuration) =>
    periodDurationElapsed > 0 && periodDurationElapsed >= periodDuration

// handle actions when a period is completed
const handlePeriodElapsed = () => {
    // auto-extend state.duration only; config.userIntendedDuration is intentionally preserved
    const extended = Period.autoExtendDuration(currentPeriod.value, DURATION_TO_ADD_AUTOMATICALLY)
    updateTimerState({
        currentPeriodProperties: {
            state: {
                duration: extended.state.duration,
                remaining: extended.state.remaining,
            },
        },
    })

    log('period automatically extended', timerState.value, 2)
}

// main update period function
const updateCurrentPeriod = () => {
    // guard clause for no current period
    if (!currentPeriod.value) return

    // calculate period times
    const { periodDurationElapsed } = calculatePeriodTimes(
        timerState.value.timestampStarted,
        timerState.value.timestampPaused,
        currentPeriod.value.state.duration,
    )

    // Write fresh elapsed/remaining first so handlePeriodElapsed sees the
    // real elapsed when it auto-extends (otherwise duration cannot clamp
    // to elapsed and the elapsed bar can overflow the period block).
    const withElapsed = Period.applyElapsed(currentPeriod.value, periodDurationElapsed)
    updateTimerState({
        currentPeriodProperties: {
            state: {
                elapsed: withElapsed.state.elapsed,
                remaining: withElapsed.state.remaining,
            },
        },
    })

    if (hasPeriodReachedCompletion(periodDurationElapsed, currentPeriod.value.state.duration))
        handlePeriodElapsed()
}

// jump to the next period
export const moveToNextPeriod = () => {
    if (timerState.value.currentPeriodIndex === null) return

    // Ensure elapsed is fresh before Period.complete reads it (a tick may not
    // have fired since the user clicked the button).
    updateCurrentPeriod()

    const nextPeriodIndex = timerState.value.currentPeriodIndex + 1
    const nextPeriod = timerState.value.periods[nextPeriodIndex]

    const { period: completed, remainder } = Period.complete(currentPeriod.value)

    updateTimerState({
        currentPeriodProperties: {
            config: {
                userIntendedDuration: completed.config.userIntendedDuration,
            },
            state: {
                duration: completed.state.duration,
                elapsed: completed.state.elapsed,
                remaining: 0,
                finished: true,
            },
        },
        timerProperties: {
            // reset start time for the next period if not paused, if the next period has already some time elapsed, compensate for it
            // also subtract the remainder so it gets added to the next period's elapsed time
            timestampStarted:
                (timerState.value.timestampPaused || Date.now())
                - nextPeriod.state.elapsed
                - remainder,
            currentPeriodIndex: timerState.value.currentPeriodIndex + 1,
        },
    })

    // Notify sound scheduler of period change
    soundScheduler.onPeriodChange()

    log('finished current period', timerState.value, 10)
}

// jump to the previous period
export const moveToPreviousPeriod = () => {
    if (timerState.value.currentPeriodIndex === null || timerState.value.currentPeriodIndex === 0)
        return

    const previousPeriodIndex = timerState.value.currentPeriodIndex - 1
    const previousPeriod = timerState.value.periods[previousPeriodIndex]

    // add duration to the previous period's duration so it doesn't finish right away
    const extendedDuration = previousPeriod.state.duration + DURATION_TO_ADD_AUTOMATICALLY
    const compensatedTimestampStarted =
        timerState.value.timestampStarted
        - previousPeriod.state.elapsed // move start back as some time already elapsed
        + currentPeriod.value.state.elapsed // move start forward to account for time elapsed in the current period

    updateTimerState({
        previousPeriodProperties: {
            state: {
                duration: extendedDuration,
                finished: false,
            },
        },
        currentPeriodProperties: {
            state: {
                finished: false,
            },
        },
        timerProperties: {
            timestampStarted: compensatedTimestampStarted,
            currentPeriodIndex: previousPeriodIndex,
        },
    })

    updateCurrentPeriod()

    log('jumped to previous period and added some time to the duration', timerState.value, 13)
}

// add time elapsed in the current period to previous and remove it from current
export const moveElapsedTimeToPreviousPeriod = () => {
    log('move time back', timerState.value, 2)
    const elapsed = currentPeriod.value.state.elapsed
    const previousPeriodIndex = timerState.value.currentPeriodIndex - 1
    const previousPeriod = timerState.value.periods[previousPeriodIndex]
    const absorbed = Period.absorbAsCompleted(previousPeriod, elapsed)

    updateTimerState({
        previousPeriodProperties: {
            state: {
                duration: absorbed.state.duration,
                elapsed: absorbed.state.elapsed,
                remaining: absorbed.state.remaining,
                finished: absorbed.state.finished,
            },
        },
        timerProperties: {},
    })

    adjustElapsed(-elapsed)

    // Notify sound scheduler of period change
    soundScheduler.onPeriodChange()
}

// change work type
export const changeType = () => {
    const types = timerState.value.types
    const currentType = currentPeriod.value.config.type
    const currentIndex = types.indexOf(currentType) // Find the index of the current type
    const nextIndex = (currentIndex + 1) % types.length // Calculate the next index (with wrap-around)

    const updated = Period.setType(currentPeriod.value, types[nextIndex])
    updateTimerState({
        currentPeriodProperties: {
            config: { type: updated.config.type },
        },
    })
    log('changed current type', timerState.value, 8)
}

// set current period to a specific type
export const setCurrentPeriodType = type => {
    const types = timerState.value.types
    if (!types.includes(type)) {
        log(`Invalid type: ${type}. Valid types are: ${types.join(', ')}`, 2)
        return
    }

    const updated = Period.setType(currentPeriod.value, type)
    updateTimerState({
        currentPeriodProperties: {
            config: { type: updated.config.type },
        },
    })
    log(`set current period type to ${type}`, timerState.value, 8)
}

// add a new period after the current one
export const addPeriod = () => {
    if (timerState.value.currentPeriodIndex === null) return

    const newPeriod = Period.create({ type: 'fun', note: '', durationMs: 24 * 60 * 1000 })

    const currentIndex = timerState.value.currentPeriodIndex
    const hasElapsedMoreThan60Seconds = currentPeriod.value.state.elapsed > 60 * 1000

    if (hasElapsedMoreThan60Seconds) {
        // Insert after current period and move to it
        const newPeriods = [...timerState.value.periods]
        newPeriods.splice(currentIndex + 1, 0, newPeriod)

        updateTimerState({
            timerProperties: {
                periods: newPeriods,
            },
        })

        moveToNextPeriod()
        log('added new period after current and moved to it', timerState.value, 5)
    } else {
        // Insert before current period and make it current.
        // Capture the displaced period's config before mutating the array so
        // Period.unstarted can use config.userIntendedDuration as the fresh duration.
        const displacedConfig = currentPeriod.value.config

        const newPeriods = [...timerState.value.periods]
        newPeriods.splice(currentIndex, 0, newPeriod)

        updateTimerState({
            timerProperties: {
                periods: newPeriods,
                currentPeriodIndex: currentIndex, // Stay at same index (now the new period)
                // Reset timestamp to current time so new period starts fresh
                timestampStarted: timerState.value.timestampPaused || Date.now(),
            },
        })

        // Reset the displaced period (now at currentIndex + 1) to fresh state via Period.unstarted.
        // config.userIntendedDuration is the source of truth for the fresh duration — if the
        // period was only auto-extended, userIntendedDuration still holds the original user target.
        // Manual extensions (via adjustDuration / Period.extendDuration) do update userIntendedDuration,
        // so unstarted correctly reflects any manual duration edit the user had made.
        const resetDisplaced = Period.unstarted(displacedConfig)
        updateTimerState({
            timerProperties: {
                periods: timerState.value.periods.map((period, index) =>
                    index !== currentIndex + 1 ? period : resetDisplaced,
                ),
            },
        })

        log(
            'added new period before current, reset current period elapsed time',
            timerState.value,
            5,
        )
    }
}

// remove the current period and move to next period (or previous if on last period)
export const removePeriod = () => {
    if (timerState.value.currentPeriodIndex === null) return
    if (timerState.value.periods.length <= 1) return // Prevent removing the last period

    const currentIndex = timerState.value.currentPeriodIndex
    const isLastPeriod = currentIndex === timerState.value.periods.length - 1

    // Store the period to remove
    const periodToRemove = currentIndex

    // First move to the next or previous period
    if (isLastPeriod) {
        // If we're on the last period, move to the previous period
        moveToPreviousPeriod()
    } else {
        // Otherwise move to next period
        moveToNextPeriod()
    }

    // After navigation, remove the original period
    const newPeriods = timerState.value.periods.filter((_, index) => index !== periodToRemove)

    // Adjust current index if needed
    // If we moved to next, we need to subtract 1 from currentPeriodIndex
    // because removing a period shifts all indices down by 1
    const newIndex = isLastPeriod
        ? timerState.value.currentPeriodIndex
        : timerState.value.currentPeriodIndex - 1

    updateTimerState({
        timerProperties: {
            periods: newPeriods,
            currentPeriodIndex: newIndex,
        },
    })

    log('removed period', timerState.value, 5)
}

// the whole timer completion
export const handleTimerCompletion = () => {
    stopTick()

    // Ensure elapsed is fresh before Period.complete reads it (a tick may not
    // have fired since the user clicked the Finish button).
    updateCurrentPeriod()

    // updates are not combined because they need to be run sequentially

    const { period: completed } = Period.complete(currentPeriod.value)

    updateTimerState({
        currentPeriodProperties: {
            config: {
                userIntendedDuration: completed.config.userIntendedDuration,
            },
            state: {
                duration: completed.state.duration,
                elapsed: completed.state.elapsed,
                remaining: 0,
                finished: true,
            },
        },
    })

    updateTimerState({
        timerProperties: {
            phase: 'completed',
            timestampStarted: null,
            currentPeriodIndex: null,
            periods: timerState.value.periods.filter(
                period => period.state.elapsed >= DURATION_TO_ADD_AUTOMATICALLY,
            ),
        },
    })

    log('finished last period', timerState.value, 1)
    playSound('timerFinished')
}

// Generic utility: update a specific period by index with an arbitrary partial { config?, state? }.
// Kept as a deep-merge utility rather than typed Period ops because callers like the timeline edit
// form use it for snapshot restore (handleCancel) which doesn't map to any single Period.X op.
// For typed single-field edits prefer Period.setType / Period.setNote where possible.
export const updatePeriod = (periodIndex, updates) => {
    const newPeriods = timerState.value.periods.map((period, index) =>
        index === periodIndex ? mergePeriod(period, updates) : period,
    )

    updateTimerState({
        timerProperties: {
            periods: newPeriods,
        },
    })

    log('updated period', { periodIndex, updates }, 5)
}

// remove a specific period by index
export const removePeriodByIndex = periodIndex => {
    if (timerState.value.periods.length <= 1) return // Prevent removing the last period
    if (periodIndex < 0 || periodIndex >= timerState.value.periods.length) return // Invalid index

    // If removing the current period, move to next/previous period first
    if (timerState.value.currentPeriodIndex === periodIndex) {
        const isLastPeriod = periodIndex === timerState.value.periods.length - 1

        if (isLastPeriod) {
            // If we're on the last period, move to the previous period
            moveToPreviousPeriod()
        } else {
            // Otherwise move to next period
            moveToNextPeriod()
        }
    }

    const newPeriods = timerState.value.periods.filter((_, index) => index !== periodIndex)

    // Adjust current period index if needed
    let newCurrentPeriodIndex = timerState.value.currentPeriodIndex
    if (newCurrentPeriodIndex !== null && newCurrentPeriodIndex > periodIndex) {
        newCurrentPeriodIndex = newCurrentPeriodIndex - 1
    } else if (newCurrentPeriodIndex === periodIndex) {
        // If we moved to next and then removed, adjust index down by 1
        const wasLastPeriod = periodIndex === timerState.value.periods.length - 1
        newCurrentPeriodIndex = wasLastPeriod
            ? timerState.value.currentPeriodIndex
            : timerState.value.currentPeriodIndex - 1
    }

    updateTimerState({
        timerProperties: {
            periods: newPeriods,
            currentPeriodIndex: newCurrentPeriodIndex,
        },
    })

    log('removed period by index', { periodIndex, newLength: newPeriods.length }, 5)
}

// Signal to track which period should auto-open for editing
export const autoEditIndex = signal(null)

// add a new period at a specific index
export const addPeriodAtIndex = (
    afterIndex,
    periodConfig = { duration: 24 * 60 * 1000, type: 'fun', note: '' },
) => {
    const newPeriod = Period.create({
        type: periodConfig.type,
        note: periodConfig.note,
        durationMs: periodConfig.duration,
    })
    const newPeriods = [...timerState.value.periods]

    // Insert after the specified index
    const newPeriodIndex = afterIndex + 1
    newPeriods.splice(newPeriodIndex, 0, newPeriod)

    // Adjust current period index if needed
    let newCurrentPeriodIndex = timerState.value.currentPeriodIndex
    if (newCurrentPeriodIndex !== null && newCurrentPeriodIndex > afterIndex) {
        newCurrentPeriodIndex = newCurrentPeriodIndex + 1
    }

    updateTimerState({
        timerProperties: {
            periods: newPeriods,
            currentPeriodIndex: newCurrentPeriodIndex,
        },
    })

    // Signal that the new period should auto-open for editing
    autoEditIndex.value = newPeriodIndex

    log('added period at index', { afterIndex, newLength: newPeriods.length }, 5)
}

// helper function to update state
const updateTimerState = updateParams => {
    const {
        previousPeriodProperties = {},
        currentPeriodProperties = {},
        timerProperties = {},
    } = updateParams

    batch(() => {
        // Update the previous period
        if (
            timerState.value.currentPeriodIndex === 0
            && Object.keys(previousPeriodProperties).length > 0
        ) {
            console.error(
                'Tried to update the previous period but there is none. Aborting. State not changed.',
            )
            return
        }

        if (Object.keys(previousPeriodProperties).length > 0) {
            timerState.value = {
                ...timerState.value,
                periods: timerState.value.periods.map((period, index) =>
                    index !== timerState.value.currentPeriodIndex - 1
                        ? period
                        : mergePeriod(period, previousPeriodProperties),
                ),
            }
        }
        // Update the current period
        if (Object.keys(currentPeriodProperties).length > 0) {
            timerState.value = {
                ...timerState.value,
                periods: timerState.value.periods.map((period, index) =>
                    index !== timerState.value.currentPeriodIndex
                        ? period
                        : mergePeriod(period, currentPeriodProperties),
                ),
            }
        }
        // Then, update timer properties
        if (Object.keys(timerProperties).length > 0) {
            timerState.value = {
                ...timerState.value,
                ...timerProperties,
            }
        }
    })
}

// update function called by interval timer
const tick = () => {
    updateCurrentPeriod()

    // Check for period-based sounds
    if (currentPeriod.value) {
        const elapsedMs = currentPeriod.value.state.elapsed
        const intendedMs = currentPeriod.value.config.userIntendedDuration
        const periodType = currentPeriod.value.config.type
        const isPaused = timerState.value.phase === 'paused'

        // Determine next period type for timesup sound selection
        const currentIndex = timerState.value.currentPeriodIndex
        const nextIndex = currentIndex + 1
        const nextPeriod = timerState.value.periods[nextIndex]
        const nextPeriodType = nextPeriod ? nextPeriod.config.type : 'finish'

        const soundToPlay = soundScheduler.checkSounds(
            elapsedMs,
            intendedMs,
            periodType,
            isPaused,
            nextPeriodType,
        )

        if (soundToPlay) {
            const soundKey = getSoundKeyFromPath(soundToPlay.soundPath)
            playPeriodSound(soundKey)
        }
    }

    // Play timer finished sound if the timer has completed
    if (timerHasFinished.value) {
        playTimerFinishedSound()
    }

    // log('tick', timerState.value, 14)
}

// persist timer state to localStorage on every state change
effect(() => {
    saveState(timerState.value)
})

// Export timer state globally for sounds module to access
if (typeof window !== 'undefined') {
    window.__timerModule = {
        timerState,
        currentPeriod,
    }
}
