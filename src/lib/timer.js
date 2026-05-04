import { signal, effect, computed, batch } from '@preact/signals'
import { saveState, loadState } from './storage'
import { playSound, playTimerFinishedSound, playPeriodSound, getSoundKeyFromPath } from './sounds'
import { log } from './log.js'
import { PERIOD_CONFIG, UI_UPDATE_INTERVAL, DURATION_TO_ADD_AUTOMATICALLY } from './config.js'
import { SoundScheduler } from './sound-scheduler'
import { AVAILABLE_SOUNDS } from './sound-discovery'
import { Period } from './period'
import { Periods } from './periods'
import { Schedule } from './schedule'

// default timer configuration — periods and types only; Schedule owns phase/timestamps/index
export const initialState = {
    types: ['work', 'break', 'fun'],
    periods: PERIOD_CONFIG.map(({ duration, type, note }) =>
        Period.create({ type, note, durationMs: duration }),
    ),
}

const initialScheduleSnapshot = {
    phase: 'idle',
    currentPeriodIndex: null,
    timestampStarted: null,
    timestampPaused: null,
}

// Boot: load persisted state (or fall back to defaults), hydrate both signals
const loaded = loadState(initialState, initialScheduleSnapshot)
export const timerState = signal(loaded.timerState)
Schedule.setSnapshot(loaded.scheduleSnapshot)

// Helper: build a log-friendly snapshot that includes the Schedule fields so
// log.js can detect the timer-state shape and format timestamps correctly.
const logSnapshot = () => ({ ...timerState.value, ...Schedule.snapshot.value })

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
export const timerHasFinished = computed(() => Schedule.isCompleted.value)
export const currentPeriod = computed(
    () => timerState.value.periods[Schedule.currentPeriodIndex.value],
)
// computed signals for timer.jsx
export const timerOnLastPeriod = computed(
    () => Schedule.currentPeriodIndex.value + 1 >= timerState.value.periods.length,
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
const periodsModifiedFromInitial = computed(() => {
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
                && !Schedule.timestampStarted.value
                && timerDurationRemaining.value !== 0)
            || (Schedule.currentPeriodIndex.value === null
                && !timerHasFinished.value
                && !periodsModifiedFromInitial.value)
        ),
)

export const canMoveToNextPeriod = computed(
    () =>
        !timerHasFinished.value
        && Schedule.currentPeriodIndex.value !== null
        && !timerOnLastPeriod.value,
)

export const canMoveToPreviousPeriod = computed(
    () =>
        !timerHasFinished.value
        && Schedule.currentPeriodIndex.value !== null
        && Schedule.currentPeriodIndex.value > 0,
)

export const canFinishTimer = computed(
    () =>
        !timerHasFinished.value
        && Schedule.currentPeriodIndex.value !== null
        && timerDurationElapsed.value >= 1 * 60 * 1000,
)

export const canAdjustElapsedForward = computed(() => Schedule.currentPeriodIndex.value !== null)

export const canAdjustElapsedBackward = computed(
    () => Schedule.currentPeriodIndex.value !== null && timerDurationElapsed.value > 0,
)

export const canAdjustDurationForward = computed(
    () => !timerHasFinished.value && Schedule.currentPeriodIndex.value !== null,
)

export const canChangeType = computed(() => Schedule.currentPeriodIndex.value !== null)

export const canAddPeriod = computed(() => Schedule.currentPeriodIndex.value !== null)

export const canRemovePeriod = computed(
    () => Schedule.currentPeriodIndex.value !== null && timerState.value.periods.length > 1,
)

export const canMoveElapsedToPrevious = computed(
    () =>
        Schedule.currentPeriodIndex.value !== null
        && timerDurationElapsed.value > 0
        && Schedule.currentPeriodIndex.value > 0,
)

// Validation functions for parameterized checks
export const canAdjustElapsed = amount => {
    if (Schedule.currentPeriodIndex.value === null) return false
    if (amount < 0 && timerDurationElapsed.value === 0) return false
    return true
}

export const canAdjustDuration = amount => {
    if (timerHasFinished.value || Schedule.currentPeriodIndex.value === null) {
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

// ============================================================================

// prepares timer for use, continuing an running timer or prepare a new one
export const initializeTimer = () => {
    console.clear()
    log('initializeTimer', logSnapshot(), 2)

    // nothing more to do if timer has finished or is paused
    if (timerHasFinished.value || Schedule.isPaused.value) return

    if (Schedule.isRunning.value) {
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

    // Reset only runtime properties, preserve existing periods
    Schedule.reset()

    console.clear()
    log('timer initialized (periods preserved)', logSnapshot(), 7)
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

// starts the timer
export const startTimer = () => {
    if (timerHasFinished.value) return // do nothing if timer has finished (needs reset)

    playSound('button')

    Schedule.start()

    updateCurrentPeriod()

    startTick()

    log('started timer', logSnapshot(), 3)
}

// resumes the timer after it was paused
export const resumeTimer = () => {
    if (timerHasFinished.value) return // do nothing if timer has finished (needs reset)

    playSound('button')

    Schedule.resume()

    updateCurrentPeriod()

    startTick()

    log('resumed timer', logSnapshot(), 13)
}

// pauses the timer
export const pauseTimer = () => {
    if (timerHasFinished.value) return // do nothing if timer has finished (needs reset)

    playSound('button')

    Schedule.pause()

    stopTick()

    updateCurrentPeriod()

    log('timer paused', logSnapshot(), 8)
}

// resets timer to the initial state
export const resetTimer = () => {
    stopTick()

    batch(() => {
        Schedule.reset()
        timerState.value = initialState
    })

    console.clear()
    log('timer reset', logSnapshot(), 7)
}

// adjusts the duration of period (user-driven manual edit)
export const adjustDuration = durationDelta => {
    // nothing to do if timer has finished or there is no current period
    if (timerHasFinished.value || Schedule.currentPeriodIndex.value === null) return

    // Ensure elapsed is fresh so the elapsed-floor in extendDuration uses the right value
    updateCurrentPeriod()

    applyToPeriod(Schedule.currentPeriodIndex.value, p => Period.extendDuration(p, durationDelta))

    // Notify sound scheduler of duration change
    soundScheduler.onDurationChange()

    log('duration adjusted', logSnapshot(), 9)
}

// adjusts elapsed time
export const adjustElapsed = elapsedDelta => {
    // nothing to do if timer has finished or there is no current period
    if (Schedule.currentPeriodIndex.value === null) return

    updateCurrentPeriod()

    Schedule.shiftStartedAt(
        Math.min(
            // prevents elapsed to go negative
            currentPeriod.value.state.elapsed,
            -elapsedDelta,
        ),
    )

    updateCurrentPeriod()

    // Notify sound scheduler of elapsed time change
    const newElapsed = currentPeriod.value.state.elapsed
    const oldElapsed = newElapsed - elapsedDelta
    soundScheduler.onElapsedAdjustment(newElapsed, oldElapsed)

    log('time adjusted', logSnapshot(), 6)
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
    applyToPeriod(Schedule.currentPeriodIndex.value, p =>
        Period.autoExtendDuration(p, DURATION_TO_ADD_AUTOMATICALLY),
    )

    log('period automatically extended', logSnapshot(), 2)
}

// main update period function
const updateCurrentPeriod = () => {
    // guard clause for no current period
    if (!currentPeriod.value) return

    // calculate period times
    const { periodDurationElapsed } = calculatePeriodTimes(
        Schedule.timestampStarted.value,
        Schedule.timestampPaused.value,
        currentPeriod.value.state.duration,
    )

    // Write fresh elapsed/remaining first so handlePeriodElapsed sees the
    // real elapsed when it auto-extends (otherwise duration cannot clamp
    // to elapsed and the elapsed bar can overflow the period block).
    applyToPeriod(Schedule.currentPeriodIndex.value, p =>
        Period.applyElapsed(p, periodDurationElapsed),
    )

    if (hasPeriodReachedCompletion(periodDurationElapsed, currentPeriod.value.state.duration))
        handlePeriodElapsed()
}

// jump to the next period
export const moveToNextPeriod = () => {
    if (Schedule.currentPeriodIndex.value === null) return

    // Ensure elapsed is fresh before Period.complete reads it (a tick may not
    // have fired since the user clicked the button).
    updateCurrentPeriod()

    const nextPeriodIndex = Schedule.currentPeriodIndex.value + 1
    const nextPeriod = timerState.value.periods[nextPeriodIndex]

    const { period: completed, remainder } = Period.complete(currentPeriod.value)

    batch(() => {
        applyToPeriod(Schedule.currentPeriodIndex.value, () => completed)

        Schedule.advance({ remainderMs: remainder, nextPeriodElapsedMs: nextPeriod.state.elapsed })
    })

    // Notify sound scheduler of period change
    soundScheduler.onPeriodChange()

    log('finished current period', logSnapshot(), 10)
}

// jump to the previous period
export const moveToPreviousPeriod = () => {
    if (Schedule.currentPeriodIndex.value === null || Schedule.currentPeriodIndex.value === 0)
        return

    const previousPeriodIndex = Schedule.currentPeriodIndex.value - 1
    const previousPeriod = timerState.value.periods[previousPeriodIndex]

    // add duration to the previous period's duration so it doesn't finish right away

    batch(() => {
        applyToPeriod(previousPeriodIndex, p => ({
            ...p,
            state: { ...p.state, duration: p.state.duration + DURATION_TO_ADD_AUTOMATICALLY },
        }))

        Schedule.rewind({
            extensionMs: DURATION_TO_ADD_AUTOMATICALLY,
            prevElapsedMs: previousPeriod.state.elapsed,
            currentElapsedMs: currentPeriod.value.state.elapsed,
        })
    })

    updateCurrentPeriod()

    log('jumped to previous period and added some time to the duration', logSnapshot(), 13)
}

// add time elapsed in the current period to previous and remove it from current
export const moveElapsedTimeToPreviousPeriod = () => {
    log('move time back', logSnapshot(), 2)
    const elapsed = currentPeriod.value.state.elapsed
    const previousPeriodIndex = Schedule.currentPeriodIndex.value - 1

    applyToPeriod(previousPeriodIndex, p => Period.absorbAsCompleted(p, elapsed))

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

    applyToPeriod(Schedule.currentPeriodIndex.value, p => Period.setType(p, types[nextIndex]))
    log('changed current type', logSnapshot(), 8)
}

// set current period to a specific type
export const setCurrentPeriodType = type => {
    const types = timerState.value.types
    if (!types.includes(type)) {
        log(`Invalid type: ${type}. Valid types are: ${types.join(', ')}`, 2)
        return
    }

    applyToPeriod(Schedule.currentPeriodIndex.value, p => Period.setType(p, type))
    log(`set current period type to ${type}`, logSnapshot(), 8)
}

// add a new period after the current one
export const addPeriod = () => {
    if (Schedule.currentPeriodIndex.value === null) return

    const newPeriod = Period.create({ type: 'fun', note: '', durationMs: 24 * 60 * 1000 })

    const currentIndex = Schedule.currentPeriodIndex.value
    const hasElapsedMoreThan60Seconds = currentPeriod.value.state.elapsed > 60 * 1000

    if (hasElapsedMoreThan60Seconds) {
        // Insert after current period and move to it
        const newPeriods = [...timerState.value.periods]
        newPeriods.splice(currentIndex + 1, 0, newPeriod)

        timerState.value = { ...timerState.value, periods: newPeriods }

        moveToNextPeriod()
        log('added new period after current and moved to it', logSnapshot(), 5)
    } else {
        // Insert before current period and make it current.
        // Capture the displaced period's config before mutating the array so
        // Period.unstarted can use config.userIntendedDuration as the fresh duration.
        const displacedConfig = currentPeriod.value.config

        const newPeriods = [...timerState.value.periods]
        newPeriods.splice(currentIndex, 0, newPeriod)

        batch(() => {
            timerState.value = { ...timerState.value, periods: newPeriods }
            // Stay at same index (now the new period) and reset start timestamp
            Schedule.setIndex(currentIndex)
            Schedule.restartCurrentPeriod()
        })

        // Reset the displaced period (now at currentIndex + 1) to fresh state via Period.unstarted.
        // config.userIntendedDuration is the source of truth for the fresh duration — if the
        // period was only auto-extended, userIntendedDuration still holds the original user target.
        // Manual extensions (via adjustDuration / Period.extendDuration) do update userIntendedDuration,
        // so unstarted correctly reflects any manual duration edit the user had made.
        const resetDisplaced = Period.unstarted(displacedConfig)
        timerState.value = {
            ...timerState.value,
            periods: timerState.value.periods.map((period, index) =>
                index !== currentIndex + 1 ? period : resetDisplaced,
            ),
        }

        log('added new period before current, reset current period elapsed time', logSnapshot(), 5)
    }
}

// remove the current period and move to next period (or previous if on last period)
export const removePeriod = () => {
    if (Schedule.currentPeriodIndex.value === null) return
    if (timerState.value.periods.length <= 1) return // Prevent removing the last period

    const currentIndex = Schedule.currentPeriodIndex.value
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
        ? Schedule.currentPeriodIndex.value
        : Schedule.currentPeriodIndex.value - 1

    batch(() => {
        timerState.value = { ...timerState.value, periods: newPeriods }
        Schedule.setIndex(newIndex)
    })

    log('removed period', logSnapshot(), 5)
}

// the whole timer completion
export const handleTimerCompletion = () => {
    stopTick()

    // Ensure elapsed is fresh before Period.complete reads it (a tick may not
    // have fired since the user clicked the Finish button).
    updateCurrentPeriod()

    // updates are not combined because they need to be run sequentially

    const { period: completed } = Period.complete(currentPeriod.value)
    applyToPeriod(Schedule.currentPeriodIndex.value, () => completed)

    const filteredPeriods = timerState.value.periods.filter(
        period => period.state.elapsed >= DURATION_TO_ADD_AUTOMATICALLY,
    )

    batch(() => {
        timerState.value = { ...timerState.value, periods: filteredPeriods }
        Schedule.complete()
        Schedule.setIndex(null)
    })

    log('finished last period', logSnapshot(), 1)
    playSound('timerFinished')
}

// remove a specific period by index
export const removePeriodByIndex = periodIndex => {
    if (timerState.value.periods.length <= 1) return // Prevent removing the last period
    if (periodIndex < 0 || periodIndex >= timerState.value.periods.length) return // Invalid index

    // If removing the current period, move to next/previous period first
    if (Schedule.currentPeriodIndex.value === periodIndex) {
        const isLastPeriod = periodIndex === timerState.value.periods.length - 1

        if (isLastPeriod) {
            // If we're on the last period, move to the previous period
            moveToPreviousPeriod()
        } else {
            // Otherwise move to next period
            moveToNextPeriod()
        }
    }

    const result = Periods.remove({
        periods: timerState.value.periods,
        currentIndex: Schedule.currentPeriodIndex.value,
        indexToRemove: periodIndex,
    })

    batch(() => {
        timerState.value = { ...timerState.value, periods: result.periods }
        Schedule.setIndex(result.currentIndex)
    })

    log('removed period by index', { periodIndex, newLength: result.periods.length }, 5)
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

    const result = Periods.insert({
        periods: timerState.value.periods,
        currentIndex: Schedule.currentPeriodIndex.value,
        atIndex: afterIndex + 1,
        period: newPeriod,
    })

    batch(() => {
        timerState.value = { ...timerState.value, periods: result.periods }
        Schedule.setIndex(result.currentIndex)
    })

    // Signal that the new period should auto-open for editing
    autoEditIndex.value = afterIndex + 1

    log('added period at index', { afterIndex, newLength: result.periods.length }, 5)
}

// Apply a Period → Period op to the period at the given index.
// Out-of-range index produces a no-op write. Index validation is the caller's responsibility.
export const applyToPeriod = (index, op) => {
    timerState.value = {
        ...timerState.value,
        periods: timerState.value.periods.map((period, i) => (i === index ? op(period) : period)),
    }
}

// update function called by interval timer
const tick = () => {
    updateCurrentPeriod()

    // Check for period-based sounds
    if (currentPeriod.value) {
        const elapsedMs = currentPeriod.value.state.elapsed
        const intendedMs = currentPeriod.value.config.userIntendedDuration
        const periodType = currentPeriod.value.config.type
        const isPaused = Schedule.isPaused.value

        // Determine next period type for timesup sound selection
        const currentIndex = Schedule.currentPeriodIndex.value
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

    // log('tick', logSnapshot(), 14)
}

// persist timer state to localStorage on every state change
effect(() => {
    saveState({ ...timerState.value, ...Schedule.snapshot.value })
})

// Export timer state globally for sounds module to access
if (typeof window !== 'undefined') {
    window.__timerModule = {
        timerState,
        currentPeriod,
        Schedule,
    }
}
