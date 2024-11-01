import { signal, effect } from '@preact/signals';
import { saveState, loadState } from './storage';
import { log } from './util';


// Time in milliseconds between timer updates
const updatePeriod = 500;

// Default timer configuration
export const initialState = {
  currentPeriodIndex: null,     // track current period
  timerDurationRemaining: null, // milliseconds remaining on timer
  timerDuration: null,          // total duration of timer in milliseconds
  timerDurationElapsed: 0,      // milliseconds elapsed on timer
  timerHasFinished: false,      // if timer has completed
  runningIntervalId: null,      // ID of the interval timer, null when not running
  timePaused: null,             // timestamp when timer was paused
  timeStarted: null,            // timestamp when timer was started
  periods: [
    { type: 'work',  periodDuration: 4 * 1000, periodDurationElapsed: 0, hasFinished: false },
    { type: 'break', periodDuration: 2 * 1000, periodDurationElapsed: 0, hasFinished: false },
    { type: 'work',  periodDuration: 4 * 1000, periodDurationElapsed: 0, hasFinished: false },
  ],
};


// Main timer state signal, initialized from localStorage or defaults
export const timerState = signal(saveState(loadState(initialState)));

// Prepares timer for use, either continuing existing timer or setting up new one
export const initializeTimer = () => {
  console.clear();
  log('initializeTimer', timerState.value, 'black', 'white');

  // nothing more to do if timer has finished or is paused
  if (timerState.value.timerHasFinished || timerState.value.timePaused) return;

  if (timerState.value.runningIntervalId) { // continue the timer if it was running
    startTimer();
  } else { // set up fresh timer
    const timerDuration = timerState.value.periods.reduce((sum, period) => sum + period.periodDuration, 0);
    timerState.value = {
      ...timerState.value,
      timerDuration: timerDuration,
      timerDurationRemaining: timerDuration, // set to full duration
    };
  }
};

// Starts the timer
export const startTimer = () => {
  if (timerState.value.timerDurationRemaining === 0) return; // nothing to do if no remaining duration
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
    runningIntervalId: setInterval(tick, updatePeriod),
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
    timerDurationRemaining: Math.max(
      0,
      timerState.value.timeStarted + timerState.value.timerDuration - now
    ),
    timerDurationElapsed: now - timerState.value.timeStarted
  };

  // Handle timer completion
  if (timerState.value.timerDurationRemaining === 0) {
    clearInterval(timerState.value.runningIntervalId);

    timerState.value = {
      ...timerState.value,
      timerHasFinished: true,
      runningIntervalId: null,
    };
    log('timer finished', timerState.value, 'red', 'black');
  };
  log('tick', timerState.value, 'skyblue', 'black');
};

// Resets timer to initial state
export const resetTimer = () => {
  clearInterval(timerState.value.runningIntervalId);

  const timerDuration = timerState.value.periods.reduce((sum, period) => sum + period.periodDuration, 0); // todo: deduplicate

  timerState.value = {
    ...initialState,
    timerDuration: timerDuration,
    timerDurationRemaining: timerDuration, // set to full duration
    timerDurationElapsed: 0,
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
  if (timerState.value.timerHasFinished) return; // nothing to do if timer has finished
  timerState.value = {
    ...timerState.value,
    timerDuration: Math.max(0, timerState.value.timerDuration + durationDelta),
    timerDurationRemaining: Math.max(0, timerState.value.timerDurationRemaining + durationDelta),
  };
  log('duration adjusted', timerState.value, 'purple', 'white');
};

// Persists timer state to localStorage on every state change
effect(() => {
  saveState(timerState.value);
});

