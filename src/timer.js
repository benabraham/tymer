import {signal, effect, computed} from '@preact/signals'
import {saveState, loadState} from './storage'
import {playSound} from './sounds'
import {log} from './util'

const UI_UPDATE_INTERVAL = 1000 // time between timer updates in milliseconds
const DURATION_TO_ADD_AUTOMATICALLY = 1 * 60 * 1000

// period configuration
const PERIOD_CONFIG = [
    {duration: 48 * 60 * 1000, type: 'work'},
    {duration: 24 * 60 * 1000, type: 'break'},
    {duration: 48 * 60 * 1000, type: 'work'},
    {duration: 24 * 60 * 1000, type: 'break'},
    {duration: 48 * 60 * 1000, type: 'work'},
    {duration: 60 * 60 * 1000, type: 'break'},
    {duration: 48 * 60 * 1000, type: 'work'},
    {duration: 24 * 60 * 1000, type: 'break'},
    {duration: 48 * 60 * 1000, type: 'work'},
    {duration: 24 * 60 * 1000, type: 'break'},
    {duration: 48 * 60 * 1000, type: 'work'},
    {duration: 24 * 60 * 1000, type: 'break'},
    {duration: 48 * 60 * 1000, type: 'work'},
]

// function to create a period from a period config
const createPeriod = ({duration, type}) => ({
    periodDuration: duration,
    periodDurationElapsed: 0,
    periodDurationRemaining: duration, // initialize with full duration
    periodHasFinished: false,
    type,
})

// default timer configuration
export const initialState = {
    currentPeriodIndex: null,   // track current period
    runningIntervalId: null,    // ID of the interval timer, null when not running
    timestampPaused: null,      // timestamp when timer was paused
    timestampStarted: null,     // timestamp when timer was started
    shouldGoToNextPeriod: null, // used only visually to blink the button
    periods: PERIOD_CONFIG.map(createPeriod)
}

// timer state signal, initialized from localStorage or defaults
export const timerState = signal(saveState(loadState(initialState)))

// computed signals
export const timerHasFinished = computed(() => timerState.value.periods[timerState.value.periods.length - 1]?.periodHasFinished)
export const timerOnLastPeriod = computed(() => timerState.value.currentPeriodIndex + 1 >= timerState.value.periods.length)

// prepares timer for use, continuing an running timer or prepare a new one
export const initializeTimer = () => {
    console.clear()
    log('initializeTimer', timerState.value, 2)

    // nothing more to do if timer has finished or is paused
    if (timerHasFinished.value || timerState.value.timestampPaused) return

    if (timerState.value.runningIntervalId) { // continue (restart) the timer if it was running
        updateCurrentPeriod()
        startTick()
    } else { // prepare a new timer
        resetTimer()
    }
}

// starts repeating the tick function to update UI periodically
const startTick = () => {
    timerState.value = {
        ...timerState.value,
        runningIntervalId: setInterval(tick, UI_UPDATE_INTERVAL),
    }
}

// stops repeating the tick function
const stopTick = () => {
    clearInterval(timerState.value.runningIntervalId)
    timerState.value = {
        ...timerState.value,
        runningIntervalId: null,
    }
}

// starts the timer
export const startTimer = () => {
    if (timerHasFinished.value) return // do nothing if timer has finished (needs reset)

    playSound('button')

    timerState.value = {
        ...timerState.value,
        currentPeriodIndex: 0,
        timestampStarted: Date.now()
    }

    updateCurrentPeriod()

    startTick()

    log('started timer', timerState.value, 3)
}

// resumes the timer after it was paused
export const resumeTimer = () => {
    if (timerHasFinished.value) return // do nothing if timer has finished (needs reset)

    playSound('button')

    const durationPaused = Date.now() - timerState.value.timestampPaused

    timerState.value = {
        ...timerState.value,
        timestampPaused: null,
        // adjust the start time for the pause duration
        timestampStarted: timerState.value.timestampStarted + durationPaused,
    }

    updateCurrentPeriod()

    startTick()

    log('resumed timer', timerState.value, 13)
}

// pauses the timer
export const pauseTimer = () => {
    if (timerHasFinished.value) return // do nothing if timer has finished (needs reset)

    playSound('button')

    timerState.value = {
        ...timerState.value,
        timestampPaused: Date.now(),
    }

    stopTick()

    updateCurrentPeriod()

    log('timer paused', timerState.value, 8)
}

// resets timer to the initial state
export const resetTimer = () => {
    stopTick()

    timerState.value = {...initialState}

    console.clear()
    log('timer reset', timerState.value, 7)
}

// adjusts the duration of period
export const adjustDuration = (durationDelta) => {
    // nothing to do if timer has finished or there is no current period
    if (timerHasFinished.value || timerState.value.currentPeriodIndex === null) return

    timerState.value = {
        ...timerState.value,
        periods: timerState.value.periods.map((period, index) =>
            index !== timerState.value.currentPeriodIndex ? period : {
                ...period,
                periodDuration: Math.max(
                    period.periodDurationElapsed,
                    period.periodDuration + durationDelta
                ),
            }
        )
    }

    updateCurrentPeriod()

    log('duration adjusted', timerState.value, 9)
}


// adjusts elapsed time
export const adjustElapsed = (elapsedDelta) => {
    // nothing to do if timer has finished or there is no current period
    if (timerState.value.currentPeriodIndex === null) return

    updateCurrentPeriod()

    timerState.value = {
        ...timerState.value,
        timestampStarted:
            timerState.value.timestampStarted
            + Math.min( // prevents elapsed to go negative
                timerState.value.periods[timerState.value.currentPeriodIndex].periodDurationElapsed,
                -elapsedDelta
            ),
    }

    updateCurrentPeriod()

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
        periodDurationRemaining
    }
}

// check if the period has elapsed
const hasPeriodReachedCompletion = (periodDurationElapsed, periodDuration) =>
    periodDurationElapsed > 0 && periodDurationElapsed >= periodDuration

// handle actions when a period is completed
const handlePeriodElapsed = () => {
    timerState.value = {
        ...timerState.value,
        shouldGoToNextPeriod: true,
    }

    // automatically extend duration
    adjustDuration(DURATION_TO_ADD_AUTOMATICALLY)

    playSound('periodEnd')
    log('period automatically extended', timerState.value, 2)
}

// main update period function
const updateCurrentPeriod = () => {
    const currentPeriod = timerState.value.periods[timerState.value.currentPeriodIndex]
    // guard clause for no current period
    if (!currentPeriod) return

    // calculate period times
    const {periodDurationElapsed, periodDurationRemaining} = calculatePeriodTimes(
        timerState.value.timestampStarted,
        timerState.value.timestampPaused,
        currentPeriod.periodDuration
    )

    // handle period completion if necessary
    if (hasPeriodReachedCompletion(periodDurationElapsed, currentPeriod.periodDuration)) handlePeriodElapsed()

    // update the current period's state
    timerState.value = {
        ...timerState.value,
        periods: timerState.value.periods.map((period, index) =>
            index !== timerState.value.currentPeriodIndex ? period : {
                ...period,
                periodDurationElapsed,
                periodDurationRemaining,
            }
        ),
    }
}

// handler for non-last periods
export const handlePeriodCompletion = () => {
    if (timerState.value.currentPeriodIndex === null) return

    timerState.value = {
        ...timerState.value,
        shouldGoToNextPeriod: false,
        // reset start time for the new period if not paused
        timestampStarted: timerState.value.timestampPaused || Date.now(),
        currentPeriodIndex: timerState.value.currentPeriodIndex + 1,
        periods: timerState.value.periods.map((period, index) =>
            index !== timerState.value.currentPeriodIndex ? period : {
                ...period,
                periodDuration: period.periodDurationElapsed,
                periodDurationRemaining: 0,
                periodHasFinished: true,
            }
        ),
    }

    log('finished current period', timerState.value, 10)
}

// handler for the last period
export const handleTimerFinish = () => {
    if (timerState.value.currentPeriodIndex === null) return

    stopTick()

    timerState.value = {
        ...timerState.value,
        shouldGoToNextPeriod: false,
        timestampStarted: null,
        currentPeriodIndex: null,
        periods: timerState.value.periods.map((period, index) =>
            index !== timerState.value.currentPeriodIndex ? period : {
                ...period,
                periodDuration: period.periodDurationElapsed,
                periodDurationRemaining: 0,
                periodHasFinished: true,
            }
        ).filter(period => period.periodDurationElapsed > DURATION_TO_ADD_AUTOMATICALLY)
    }

    log('finished last period', timerState.value, 10)
    playSound('timerEnd')
}

// checks if two numbers are divisible without remainder or almost
const isDivisibleWithTolerance = (dividend, divisor, tolerance) => {
    if (divisor === 0) return false // avoid division by zero
    const remainder = Math.abs(dividend % divisor)
    return remainder <= tolerance || Math.abs(remainder - divisor) <= tolerance
}

// plays sound around the time of each interval
const playSoundEvery = (interval) => {
    if (
        isDivisibleWithTolerance(
            timerState.value.periods[timerState.value.currentPeriodIndex].periodDurationElapsed,
            interval,
            400
        )
    ) {
        playSound('tick')
    }
}

// update function called by interval timer
const tick = () => {
    updateCurrentPeriod()
    playSoundEvery(12 * 60 * 1000)
    log('tick', timerState.value, 14)
}

// persist timer state to localStorage on every state change
effect(() => {
    saveState(timerState.value)
})
