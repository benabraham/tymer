import { signal, effect, computed, batch } from '@preact/signals'
import { saveState, loadState } from './storage'
import {
    playSound,
    playTimerNotifications,
    playPeriodEndNotification,
    invalidateSoundWindows,
} from './sounds'
import { log } from './log.js'
import { PERIOD_CONFIG, UI_UPDATE_INTERVAL, DURATION_TO_ADD_AUTOMATICALLY } from './config.js'

// function to create a period from a period config
const createPeriod = ({ duration, type, note }) => ({
    periodDuration: duration,
    periodDurationElapsed: 0,
    periodDurationRemaining: duration, // initialize with full duration
    periodHasFinished: false,
    periodUserIntendedDuration: duration, // track user's intended duration (excludes automatic extensions)
    type,
    note,
})

// default timer configuration
export const initialState = {
    currentPeriodIndex: null, // track current period
    runningIntervalId: null, // ID of the interval timer, null when not running
    timestampPaused: null, // timestamp when timer was paused
    timestampStarted: null, // timestamp when timer was started
    types: ['work', 'break', 'fun'],
    periods: PERIOD_CONFIG.map(createPeriod),
}

export const roundDownToBaseMinute = timeInMs => {
    const oneMinute = 60 * 1000
    const roundedDown = Math.floor(timeInMs / oneMinute) * oneMinute
    const remainder = timeInMs - roundedDown
    return { roundedDown, remainder }
}

// timer state signal, initialized from localStorage or defaults
export const timerState = signal(loadState(initialState))

// computed signals
export const timerHasFinished = computed(
    () => timerState.value.periods[timerState.value.periods.length - 1]?.periodHasFinished,
)
export const currentPeriod = computed(
    () => timerState.value.periods[timerState.value.currentPeriodIndex],
)
// computed signals for timer.jsx
export const timerOnLastPeriod = computed(
    () => timerState.value.currentPeriodIndex + 1 >= timerState.value.periods.length,
)
export const timerDuration = computed(() =>
    timerState.value.periods.reduce((sum, period) => sum + period.periodDuration, 0),
)
export const timerDurationElapsed = computed(() =>
    timerState.value.periods.reduce((sum, period) => sum + period.periodDurationElapsed, 0),
)
export const timerDurationRemaining = computed(() =>
    timerState.value.periods.reduce((sum, period) => sum + period.periodDurationRemaining, 0),
)
export const shouldGoToNextPeriod = computed(
    () =>
        currentPeriod.value
        && currentPeriod.value.periodDuration !== currentPeriod.value.periodUserIntendedDuration,
)

// check if periods have been modified from initial configuration
export const periodsModifiedFromInitial = computed(() => {
    const currentPeriods = timerState.value.periods
    const initialPeriods = initialState.periods

    if (currentPeriods.length !== initialPeriods.length) return true

    return currentPeriods.some((period, index) => {
        const initialPeriod = initialPeriods[index]
        return (
            period.type !== initialPeriod.type
            || period.note !== initialPeriod.note
            || period.periodDuration !== initialPeriod.periodDuration
        )
    })
})

// prepares timer for use, continuing an running timer or prepare a new one
export const initializeTimer = () => {
    console.clear()
    log('initializeTimer', timerState.value, 2)

    // nothing more to do if timer has finished or is paused
    if (timerHasFinished.value || timerState.value.timestampPaused) return

    if (timerState.value.runningIntervalId) {
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
    invalidateSoundWindows('timer initialized')

    // Reset only runtime properties, preserve existing periods
    updateTimerState({
        timerProperties: {
            currentPeriodIndex: null,
            runningIntervalId: null,
            timestampPaused: null,
            timestampStarted: null,
        },
    })

    console.clear()
    log('timer initialized (periods preserved)', timerState.value, 7)
}

// starts repeating the tick function to update UI periodically
const startTick = () => {
    updateTimerState({
        timerProperties: { runningIntervalId: setInterval(tick, UI_UPDATE_INTERVAL) },
    })
}

// stops repeating the tick function
const stopTick = () => {
    clearInterval(timerState.value.runningIntervalId)
    updateTimerState({
        timerProperties: { runningIntervalId: null },
    })
}

// starts the timer
export const startTimer = () => {
    if (timerHasFinished.value) return // do nothing if timer has finished (needs reset)

    playSound('button')

    updateTimerState({
        timerProperties: {
            currentPeriodIndex: 0,
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
            timestampPaused: null,
            // adjust the start time for the pause duration
            timestampStarted: timerState.value.timestampStarted + durationPaused,
        },
    })

    updateCurrentPeriod()

    // Invalidate sound windows since timestampStarted changed during resume
    invalidateSoundWindows('timer resumed - timestamp adjusted')

    startTick()

    log('resumed timer', timerState.value, 13)
}

// pauses the timer
export const pauseTimer = () => {
    if (timerHasFinished.value) return // do nothing if timer has finished (needs reset)

    playSound('button')

    updateTimerState({
        timerProperties: { timestampPaused: Date.now() },
    })

    stopTick()

    updateCurrentPeriod()

    // Invalidate sound windows since timer is paused (will be recreated on resume)
    invalidateSoundWindows('timer paused')

    log('timer paused', timerState.value, 8)
}

// resets timer to the initial state
export const resetTimer = () => {
    stopTick()

    // Clear all sound windows before resetting state
    invalidateSoundWindows('timer reset')

    timerState.value = { ...initialState }

    console.clear()
    log('timer reset', timerState.value, 7)
}

// adjusts the duration of period
export const adjustDuration = (durationDelta, isAutomaticExtension = false) => {
    // nothing to do if timer has finished or there is no current period
    if (timerHasFinished.value || timerState.value.currentPeriodIndex === null) return

    const newDuration = Math.max(
        currentPeriod.value.periodDurationElapsed,
        currentPeriod.value.periodDuration + durationDelta,
    )

    const updateProperties = {
        periodDuration: newDuration,
    }

    // Only update user intended duration for manual changes, not automatic extensions
    if (!isAutomaticExtension) {
        updateProperties.periodUserIntendedDuration = newDuration
    }

    updateTimerState({
        currentPeriodProperties: updateProperties,
    })

    updateCurrentPeriod()

    // Only invalidate sound windows for manual adjustments, not automatic extensions
    if (!isAutomaticExtension) {
        invalidateSoundWindows('duration adjustment')
    }

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
                    currentPeriod.value.periodDurationElapsed,
                    -elapsedDelta,
                ),
        },
    })

    updateCurrentPeriod()

    // Invalidate sound windows since timestamp changed
    invalidateSoundWindows('time adjustment')

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
    // automatically extend duration (don't invalidate sound windows)
    adjustDuration(DURATION_TO_ADD_AUTOMATICALLY, true)

    // Get the next period type for the appropriate sound
    const nextPeriodIndex = timerState.value.currentPeriodIndex + 1
    const nextPeriod = timerState.value.periods[nextPeriodIndex]
    const nextPeriodType = nextPeriod?.type || 'work'

    playPeriodEndNotification(
        nextPeriodType,
        currentPeriod.value.periodDurationElapsed,
        currentPeriod.value.periodUserIntendedDuration,
    )
    log('period automatically extended', timerState.value, 2)
}

// main update period function
const updateCurrentPeriod = () => {
    // guard clause for no current period
    if (!currentPeriod.value) return

    // calculate period times
    const { periodDurationElapsed, periodDurationRemaining } = calculatePeriodTimes(
        timerState.value.timestampStarted,
        timerState.value.timestampPaused,
        currentPeriod.value.periodDuration,
    )

    // handle period completion if necessary
    if (hasPeriodReachedCompletion(periodDurationElapsed, currentPeriod.value.periodDuration))
        handlePeriodElapsed()

    // update the current period's state
    updateTimerState({
        currentPeriodProperties: {
            periodDurationElapsed,
            periodDurationRemaining,
        },
    })
}

// jump to the next period
export const moveToNextPeriod = () => {
    if (timerState.value.currentPeriodIndex === null) return

    const nextPeriodIndex = timerState.value.currentPeriodIndex + 1
    const nextPeriod = timerState.value.periods[nextPeriodIndex]

    const { roundedDown, remainder } = roundDownToBaseMinute(
        currentPeriod.value.periodDurationElapsed,
    )

    updateTimerState({
        currentPeriodProperties: {
            periodDuration: roundedDown,
            periodDurationElapsed: roundedDown,
            periodDurationRemaining: 0,
            periodHasFinished: true,
            periodUserIntendedDuration: roundedDown,
        },
        timerProperties: {
            // reset start time for the next period if not paused, if the next period has already some time elapsed, compensate for it
            // also subtract the remainder so it gets added to the next period's elapsed time
            timestampStarted:
                (timerState.value.timestampPaused || Date.now())
                - nextPeriod.periodDurationElapsed
                - remainder,
            currentPeriodIndex: timerState.value.currentPeriodIndex + 1,
        },
    })

    // Invalidate sound windows since we moved to next period
    invalidateSoundWindows('moved to next period')

    log('finished current period', timerState.value, 10)
}

// jump to the previous period
export const moveToPreviousPeriod = () => {
    if (timerState.value.currentPeriodIndex === null || timerState.value.currentPeriodIndex === 0)
        return

    const previousPeriodIndex = timerState.value.currentPeriodIndex - 1
    const previousPeriod = timerState.value.periods[previousPeriodIndex]

    // add duration to the previous period's duration so it doesn't finish right away
    const extendedDuration = previousPeriod.periodDuration + DURATION_TO_ADD_AUTOMATICALLY
    const compensatedTimestampStarted =
        timerState.value.timestampStarted
        - previousPeriod.periodDurationElapsed // move start back as some time already elapsed
        + currentPeriod.value.periodDurationElapsed // move start forward to account for time elapsed in the current period

    updateTimerState({
        previousPeriodProperties: {
            periodDuration: extendedDuration,
            periodHasFinished: false,
        },
        currentPeriodProperties: {
            periodHasFinished: false,
        },
        timerProperties: {
            timestampStarted: compensatedTimestampStarted,
            currentPeriodIndex: previousPeriodIndex,
        },
    })

    updateCurrentPeriod()

    // Invalidate sound windows since we moved to previous period
    invalidateSoundWindows('moved to previous period')

    log('jumped to previous period and added some time to the duration', timerState.value, 13)
}

// add time elapsed in the current period to previous and remove it from current
export const moveElapsedTimeToPreviousPeriod = () => {
    log('move time back', timerState.value, 2)
    const elapsed = currentPeriod.value.periodDurationElapsed
    const previousPeriodIndex = timerState.value.currentPeriodIndex - 1
    const previousPeriod = timerState.value.periods[previousPeriodIndex]
    const extendedDuration = previousPeriod.periodDuration + elapsed

    updateTimerState({
        previousPeriodProperties: {
            periodDuration: extendedDuration,
            periodDurationElapsed: extendedDuration,
        },
        timerProperties: {},
    })

    adjustElapsed(-elapsed)
}

// change work type
export const changeType = () => {
    const types = timerState.value.types
    const currentType = currentPeriod.value.type
    const currentIndex = types.indexOf(currentType) // Find the index of the current type
    const nextIndex = (currentIndex + 1) % types.length // Calculate the next index (with wrap-around)

    updateTimerState({
        currentPeriodProperties: {
            type: types[nextIndex], // Set the new type
        },
    })
    log('changed current type', timerState.value, 8)
}

// add a new period after the current one
export const addPeriod = () => {
    if (timerState.value.currentPeriodIndex === null) return

    const newPeriod = createPeriod({
        duration: 24 * 60 * 1000, // 24 minutes
        type: 'fun',
    })

    const currentIndex = timerState.value.currentPeriodIndex
    const hasElapsedMoreThan60Seconds = currentPeriod.value.periodDurationElapsed > 60 * 1000

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
        // Insert before current period and make it current
        const newPeriods = [...timerState.value.periods]
        newPeriods.splice(currentIndex, 0, newPeriod)

        // Use the current period's original duration (before any adjustments)
        const currentPeriodOriginalDuration = currentPeriod.value.periodDuration

        updateTimerState({
            timerProperties: {
                periods: newPeriods,
                currentPeriodIndex: currentIndex, // Stay at same index (now the new period)
                // Reset timestamp to current time so new period starts fresh
                timestampStarted: timerState.value.timestampPaused || Date.now(),
            },
        })

        // Invalidate sound windows since timestampStarted was reset
        invalidateSoundWindows('period added - timestamp reset')

        // Reset the next period (originally current) to have 0 elapsed time and full duration
        updateTimerState({
            timerProperties: {
                periods: timerState.value.periods.map((period, index) =>
                    index !== currentIndex + 1
                        ? period
                        : {
                              ...period,
                              periodDuration: currentPeriodOriginalDuration,
                              periodDurationElapsed: 0,
                              periodDurationRemaining: currentPeriodOriginalDuration,
                              periodHasFinished: false,
                          },
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

    // Invalidate sound windows since timer is completing
    invalidateSoundWindows('timer completion')

    // updates are not combined because they need to be run sequentially

    const { roundedDown } = roundDownToBaseMinute(currentPeriod.value.periodDurationElapsed)

    updateTimerState({
        currentPeriodProperties: {
            periodDuration: roundedDown,
            periodDurationElapsed: roundedDown,
            periodDurationRemaining: 0,
            periodHasFinished: true,
        },
    })

    updateTimerState({
        timerProperties: {
            timestampStarted: null,
            currentPeriodIndex: null,
            periods: timerState.value.periods.filter(
                period => period.periodDurationElapsed >= DURATION_TO_ADD_AUTOMATICALLY,
            ),
        },
    })

    log('finished last period', timerState.value, 1)
    playSound('timerFinished')
}

// update a specific period by index
export const updatePeriod = (periodIndex, updates) => {
    const newPeriods = timerState.value.periods.map((period, index) =>
        index === periodIndex ? { ...period, ...updates } : period,
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
    const newPeriod = createPeriod(periodConfig)
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
                        : {
                              ...period,
                              ...previousPeriodProperties,
                          },
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
                        : {
                              ...period,
                              ...currentPeriodProperties,
                          },
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

    // Play timer notifications if there's a current period
    if (currentPeriod.value) {
        const nextPeriodIndex = timerState.value.currentPeriodIndex + 1
        const nextPeriod = timerState.value.periods[nextPeriodIndex]
        const nextPeriodType = nextPeriod?.type || 'work'

        playTimerNotifications(
            currentPeriod.value.periodDurationElapsed,
            currentPeriod.value.periodDuration,
            timerState.value.timestampStarted,
            currentPeriod.value.periodUserIntendedDuration,
            currentPeriod.value.type,
        )
    }

    log('tick', timerState.value, 14)
}

// persist timer state to localStorage on every state change
effect(() => {
    saveState(timerState.value)
})
