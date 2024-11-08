import { signal, effect, computed } from '@preact/signals'
import { saveState, loadState } from './storage'
import { playSound } from './sounds';
import { log } from './util'

export const TIMER_SCALE = 10 // 1000 is 1:1, lower means shorter everything
const UI_UPDATE_INTERVAL = 0.5 * 60 * TIMER_SCALE // Time in milliseconds between timer updates
const DURATION_TO_ADD_AUTOMATICALLY = UI_UPDATE_INTERVAL * 10

// Period configuration
const PERIOD_CONFIG = [
  { duration: 50 * 60 * TIMER_SCALE, type: 'work' },
  { duration: 25 * 60 * TIMER_SCALE, type: 'break' },
  { duration: 50 * 60 * TIMER_SCALE, type: 'work' },
  { duration: 25 * 60 * TIMER_SCALE, type: 'break' },
]

// function to create a period from a period config
const createPeriod = ({ duration, type }) => ({
  periodDuration: duration,
  periodDurationElapsed: 0,
  periodDurationRemaining: duration, // initialize with full duration
  periodHasFinished: false,
  type,
})

// Default timer configuration
export const initialState = {
  currentPeriodIndex: null, // track current period
  runningIntervalId: null,  // ID of the interval timer, null when not running
  timestampPaused: null,    // timestamp when timer was paused
  timestampStarted: null,   // timestamp when timer was started
  shouldGoToNextPeriod: null,
  periods: PERIOD_CONFIG.map(createPeriod)
}

// Timer state signal, initialized from localStorage or defaults
export const timerState = signal(saveState(loadState(initialState)))

// Computed signals
export const timerDuration = computed(() => timerState.value.periods.reduce((sum, period) => sum + period.periodDuration, 0))
export const timerDurationElapsed = computed(() => timerState.value.periods.reduce((sum, period) => sum + period.periodDurationElapsed, 0))
export const timerDurationRemaining = computed(() => timerState.value.periods.reduce((sum, period) => sum + period.periodDurationRemaining, 0))
export const timerHasFinished = computed(() => timerState.value.periods[timerState.value.periods.length - 1]?.periodHasFinished)
export const timerOnLastPeriod = computed(() => timerState.value.currentPeriodIndex + 1 >= timerState.value.periods.length)

// Prepares timer for use, either continuing existing timer or setting up new one
export const initializeTimer = () => {
  console.clear()
  log('initializeTimer', timerState.value, 2)

  // nothing more to do if timer has finished or is paused
  if (timerHasFinished.value || timerState.value.timestampPaused) return

  if (timerState.value.runningIntervalId) { // continue (restart) the timer if it was running
    startTimer()
  } else { // set up fresh timer
    resetTimer()
  }
}

const startTick = () => {
  timerState.value = {
    ...timerState.value,
    runningIntervalId: setInterval(tick, UI_UPDATE_INTERVAL),
  }
  // log('tick started', timerState.value, 12)
}

const stopTick = () => {
  clearInterval(timerState.value.runningIntervalId)
  timerState.value = {
    ...timerState.value,
    runningIntervalId: null,
  }
  // log('tick stopped', timerState.value, 11)
}

// Starts the timer
export const startTimer = () => {
  if (timerHasFinished.value) return // do nothing if timer has finished (needs reset)
  playSound('button');
  timerState.value = {
    ...timerState.value,
    currentPeriodIndex: timerState.value.currentPeriodIndex || 0,
    timestampPaused: null, // only needed when resuming (starting from paused state)
    timestampStarted: timerState.value.timestampPaused // if was paused
      // resume and adjust start time to account for the (paused duration)
      ? timerState.value.timestampStarted + (Date.now() - timerState.value.timestampPaused)
      // else leave the start time as is if available or use current time if not previously started (starting fresh)
      : timerState.value.timestampStarted || Date.now(),
  }

  updatePeriod()

  startTick()

  log('(re)started timer', timerState.value, 3)
}

// Pauses the timer
export const pauseTimer = () => {
  // todo: is no remaining time a valid reason to not pause?
  if (timerHasFinished.value || !timerDurationRemaining.value) return
  playSound('button');

  timerState.value = {
    ...timerState.value,
    timestampPaused: Date.now(),
  }

  stopTick()

  updatePeriod()

  log('timer paused', timerState.value, 8)
}

// Resets timer to initial state
export const resetTimer = () => {
  stopTick()

  timerState.value = {
    ...initialState,
  }
  console.clear()
  log('timer reset', timerState.value, 7)
}

// Update remaining time and elapsed time of the period
const updatePeriod = () => {
  const currentPeriod = timerState.value.periods[timerState.value.currentPeriodIndex]
  const timeToCalculateWith = timerState.value.timestampPaused || Date.now()

  const periodDurationElapsed = Math.max(0, timeToCalculateWith - timerState.value.timestampStarted) // todo: check if max is needed
  const periodDurationRemaining = Math.max(0, currentPeriod?.periodDuration - periodDurationElapsed)

  if (periodDurationElapsed > 0 && periodDurationRemaining === 0) {
    timerState.value = {
      ...timerState.value,
      shouldGoToNextPeriod: true,
    }
    adjustDuration(DURATION_TO_ADD_AUTOMATICALLY)
    playSound('periodEnd');
    log('period automatically extended', timerState.value, 2)
  }

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

// Adjusts the duration of period
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

  updatePeriod()

  log('duration adjusted', timerState.value, 9)
}

export const finishCurrentPeriod = (isLastPeriod) => {
  if (timerHasFinished.value || timerState.value.currentPeriodIndex === null) return

  isLastPeriod = isLastPeriod === true || timerOnLastPeriod.value

  if (isLastPeriod) stopTick()

  if (!timerState.value.periods[timerState.value.currentPeriodIndex].periodHasFinished) updatePeriod()
  timerState.value = {
    ...timerState.value,
    shouldGoToNextPeriod: false,
    timestampStarted: timerState.value.timestampPaused || Date.now(), // reset start time for the new period
    currentPeriodIndex: isLastPeriod ? null : timerState.value.currentPeriodIndex + 1,
    periods: timerState.value.periods.map((period, index) =>
      index !== timerState.value.currentPeriodIndex ? period : {
        ...period,
        periodDuration: period.periodDurationElapsed,
        periodDurationRemaining: 0,
        periodHasFinished: true,
      }
    ).filter(period => !isLastPeriod || period.periodDurationElapsed > 0),
  }

  if (isLastPeriod) {
    log('finished last period', timerState.value, 10)
    playSound('timerEnd');
  } else {
    log('finished current period', timerState.value, 10)
  }
}

// Update function called by interval timer
const tick = () => {
  updatePeriod()
  log('tick', timerState.value, 14)
}

// Persists timer state to localStorage on every state change
effect(() => {
  saveState(timerState.value)
})
