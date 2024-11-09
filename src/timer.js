import { signal, effect, computed } from '@preact/signals'
import { saveState, loadState } from './storage'
import { playSound } from './sounds';
import { log } from './util'

const UI_UPDATE_INTERVAL = 1000 // time between timer updates in milliseconds
const DURATION_TO_ADD_AUTOMATICALLY = 1 * 60 * 1000

// period configuration
const PERIOD_CONFIG = [
  { duration: 48 * 60 * 1000, type: 'work' },
  { duration: 12 * 60 * 1000, type: 'break' },
  { duration: 48 * 60 * 1000, type: 'work' },
  { duration: 84 * 60 * 1000, type: 'lunch' },
  { duration: 48 * 60 * 1000, type: 'work' },
  { duration: 24 * 60 * 1000, type: 'break' },
  { duration: 48 * 60 * 1000, type: 'work' },
  { duration: 24 * 60 * 1000, type: 'break' },
  { duration: 48 * 60 * 1000, type: 'work' },
]

// function to create a period from a period config
const createPeriod = ({ duration, type }) => ({
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
export const timerDuration = computed(() => timerState.value.periods.reduce((sum, period) => sum + period.periodDuration, 0))
export const timerDurationElapsed = computed(() => timerState.value.periods.reduce((sum, period) => sum + period.periodDurationElapsed, 0))
export const timerDurationRemaining = computed(() => timerState.value.periods.reduce((sum, period) => sum + period.periodDurationRemaining, 0))
export const timerHasFinished = computed(() => timerState.value.periods[timerState.value.periods.length - 1]?.periodHasFinished)
export const timerOnLastPeriod = computed(() => timerState.value.currentPeriodIndex + 1 >= timerState.value.periods.length)

// prepares timer for use, continuing an running timer or prepare a new one
export const initializeTimer = () => {
  console.clear()
  log('initializeTimer', timerState.value, 2)

  // nothing more to do if timer has finished or is paused
  if (timerHasFinished.value || timerState.value.timestampPaused) return

  if (timerState.value.runningIntervalId) { // continue (restart) the timer if it was running
    resumeTimer()
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

  playSound('button');

  timerState.value = {
    ...timerState.value,
    currentPeriodIndex: 0,
    timestampStarted: Date.now()
  }

  updatePeriod()

  startTick()

  log('started timer', timerState.value, 3)
}

// resumes the timer
export const resumeTimer = () => {
  if (timerHasFinished.value) return // do nothing if timer has finished (needs reset)

  playSound('button');

  const durationPaused = Date.now() - timerState.value.timestampPaused

  timerState.value = {
    ...timerState.value,
    timestampPaused: null,
    // adjust the start time for the pause duration
    timestampStarted: timerState.value.timestampStarted + durationPaused,
  }

  updatePeriod()

  startTick()

  log('resumed timer', timerState.value, 13)
}

// pauses the timer
export const pauseTimer = () => {
  if (timerHasFinished.value) return // do nothing if timer has finished (needs reset)

  playSound('button');

  timerState.value = {
    ...timerState.value,
    timestampPaused: Date.now(),
  }

  stopTick()

  updatePeriod()

  log('timer paused', timerState.value, 8)
}

// resets timer to the initial state
export const resetTimer = () => {
  stopTick()

  timerState.value = { ...initialState }

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

  updatePeriod()

  log('duration adjusted', timerState.value, 9)
}

// updates period related values
const updatePeriod = () => {
  const currentPeriod = timerState.value.periods[timerState.value.currentPeriodIndex]
  const timeToCalculateWith = timerState.value.timestampPaused || Date.now()

  const periodDurationElapsed = Math.max(0, timeToCalculateWith - timerState.value.timestampStarted)
  const periodDurationRemaining = Math.max(0, currentPeriod?.periodDuration - periodDurationElapsed)

  const hasPeriodElapsed = periodDurationElapsed > 0 && periodDurationRemaining === 0

  if (hasPeriodElapsed) {
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

// finishes current period and contains extra logic if it's the last period
export const finishCurrentPeriod = (isLastPeriod) => {
  if (timerHasFinished.value || timerState.value.currentPeriodIndex === null) return

  isLastPeriod = isLastPeriod === true || timerOnLastPeriod.value

  if (isLastPeriod) stopTick()

  const hasCurrentPeriodNotFinished = !timerState.value.periods[timerState.value.currentPeriodIndex].periodHasFinished
  if (hasCurrentPeriodNotFinished) updatePeriod()

  timerState.value = {
    ...timerState.value,
    shouldGoToNextPeriod: false,
    // reset start time for the new period if not paused
    timestampStarted: timerState.value.timestampPaused || Date.now(),
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

// checks if two numbers are divisible without remainder or almost
const isDivisibleWithTolerance = (dividend, divisor, tolerance) => {
  if (divisor === 0) return false // avoid division by zero
  const remainder = Math.abs(dividend % divisor)
  return remainder <= tolerance || Math.abs(remainder - divisor) <= tolerance
};


// update function called by interval timer
const tick = () => {
  updatePeriod()
  // play a sound every 12 minutes elapsed in a period
  if (
    isDivisibleWithTolerance(
      timerState.value.periods[timerState.value.currentPeriodIndex].periodDurationElapsed,
      12 * 60 * 1000, 500)
  ) {
    playSound('tick')
  }
  log('tick', timerState.value, 14)
}

// persist timer state to localStorage on every state change
effect(() => {
  saveState(timerState.value)
})
