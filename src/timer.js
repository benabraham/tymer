import { signal, effect, computed } from '@preact/signals';
import { saveState, loadState } from './storage';
import { log } from './util';


// Time in milliseconds between timer updates
const UPDATE_PERIOD = 250;

// Default timer configuration
export const initialState = {
  currentPeriodIndex: null, // track current period
  runningIntervalId: null,  // ID of the interval timer, null when not running
  timePaused: null,         // timestamp when timer was paused
  timeStarted: null,        // timestamp when timer was started
  periods: [
    { periodDurationRemaining: null, periodDuration: 3 * 1000, periodDurationElapsed: 0, periodHasFinished: false, type: 'work', },
    { periodDurationRemaining: null, periodDuration: 2 * 1000, periodDurationElapsed: 0, periodHasFinished: false, type: 'break', },
    { periodDurationRemaining: null, periodDuration: 3 * 1000, periodDurationElapsed: 0, periodHasFinished: false, type: 'work', },
    { periodDurationRemaining: null, periodDuration: 2 * 1000, periodDurationElapsed: 0, periodHasFinished: false, type: 'break', },
  ],
};

// Main timer state signal, initialized from localStorage or defaults
export const timerState = signal(saveState(loadState(initialState)));

// Computed signals
export const timerDuration = computed(() => timerState.value.periods.reduce((sum, period) => sum + period.periodDuration, 0));
export const timerDurationElapsed = computed(() => timerState.value.periods.reduce((sum, period) => sum + period.periodDurationElapsed, 0));
export const timerDurationRemaining = computed(() => timerState.value.periods.reduce((sum, period) => sum + period.periodDurationRemaining, 0));
export const timerHasFinished = computed(() => timerState.value.periods[timerState.value.periods.length - 1].periodHasFinished);

// Prepares timer for use, either continuing existing timer or setting up new one
export const initializeTimer = () => {
  console.clear();
  log('initializeTimer', timerState.value, 'black', 'white');

  // nothing more to do if timer has finished or is paused
  if (timerHasFinished.value || timerState.value.timePaused) return;

  if (timerState.value.runningIntervalId) { // continue the timer if it was running
    startTimer();
  } else { // set up fresh timer
    timerState.value = {
      ...timerState.value,
      periods: timerState.value.periods.map(period => ({
        ...period,
        periodDurationRemaining: period.periodDuration
      }))
    };
  }
};

// Starts the timer
export const startTimer = () => {
  if (timerDurationRemaining.value === 0) return; // nothing to do if no remaining duration
  // if fresh, set start time to now 
  let timeStarted = Date.now();
  let currentPeriodIndex = 0;

  // if paused, adjust start time by pause duration
  if (timerState.value.timePaused) {
    timeStarted += timerState.value.timeStarted - timerState.value.timePaused;
    currentPeriodIndex = timerState.value.currentPeriodIndex;
  }

  // if continuing running timer after page load, use existing start time
  if (timerState.value.runningIntervalId) {
    timeStarted = timerState.value.timeStarted;
    currentPeriodIndex = timerState.value.currentPeriodIndex;
  }

  timerState.value = {
    ...timerState.value,
    currentPeriodIndex,
    runningIntervalId: setInterval(tick, UPDATE_PERIOD),
    timePaused: null, // only needed when resuming (starting from paused state)
    timeStarted,
  };
  log('(re)starting timer', timerState.value, 'green', 'white');
};

// Update function called by interval timer
const tick = () => {
  const now = Date.now();

  // Update remaining time and elapsed time
  timerState.value = {
    ...timerState.value,
    periods: timerState.value.periods.map((period, index) => {
      if (index !== timerState.value.currentPeriodIndex) return period
      return {
        ...period,
        periodDurationElapsed: now - timerState.value.timeStarted,
        periodDurationRemaining: Math.max(0, timerState.value.timeStarted + period.periodDuration - now)
      }
    }),
  };

  // Handle period completion
  if (timerState.value.periods[timerState.value.currentPeriodIndex].periodDurationRemaining === 0) {
    timerState.value = {
      ...timerState.value,
      currentPeriodIndex: Math.min(timerState.value.currentPeriodIndex + 1, timerState.value.periods.length - 1),
      timeStarted: Date.now(),
      periods: timerState.value.periods.map((period, index) => {
        if (index !== timerState.value.currentPeriodIndex) return period
        return {
          ...period,
          periodHasFinished: true,
        }
      }),
    };
    log('period completed', timerState.value, 'orange', 'green');
  }

  // Handle timer completion
  if (timerHasFinished.value) {
    clearInterval(timerState.value.runningIntervalId);

    timerState.value = {
      ...timerState.value,
      runningIntervalId: null,
    };
    log('timer finished', timerState.value, 'red', 'black');
  }

  log('tick ended', timerState.value, 'skyblue', 'black');
};

// Resets timer to initial state
export const resetTimer = () => {
  clearInterval(timerState.value.runningIntervalId);

  timerState.value = {
    ...initialState,
    periods: initialState.periods.map(period => ({
      ...period,
      periodDurationRemaining: period.periodDuration
    }))
  };

  log('timer reset', timerState.value, 'orange', 'black');
};

// Pauses the timer
export const pauseTimer = () => {
  if (!timerState.value.runningIntervalId) return;

  clearInterval(timerState.value.runningIntervalId);

  timerState.value = {
    ...timerState.value,
    runningIntervalId: null,
    timePaused: Date.now(),  // Store when we paused
  };
  log('timer paused', timerState.value, 'goldenrod', 'black');
};

// Adjusts the total duration of the timer
export const adjustDuration = (durationDelta) => {
  // nothing to do if timer has finished or there is no current period
  if (timerHasFinished.value || timerState.value.currentPeriodIndex === null) return

  timerState.value = {
    ...timerState.value,
    periods: timerState.value.periods.map((period, index) => {
      if (index !== timerState.value.currentPeriodIndex) return period
      return {
        ...period,
        periodDuration: Math.max(0, period.periodDuration + durationDelta),
        periodDurationRemaining: Math.max(0, period.periodDurationRemaining + durationDelta)
      }
    })
  }

  log('duration adjusted', timerState.value, 'purple', 'white')
}

// Persists timer state to localStorage on every state change
effect(() => {
  saveState(timerState.value);
});
