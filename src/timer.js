import { signal, effect } from '@preact/signals';
import { saveState, loadState } from './storage';
import { log } from './util';


// Time in milliseconds between timer updates
const updatePeriod = 500;

// Default timer configuration
const initialState = {
  durationRemaining: null,  // milliseconds remaining on timer
  durationTotal: 30 * 1000, // total duration of timer in milliseconds
  hasFinished: false,       // if timer has completed
  runningIntervalId: null,  // ID of the interval timer, null when not running
  timePaused: null,         // timestamp when timer was paused
  timeStarted: null,        // timestamp when timer was started
};

// Main timer state signal, initialized from localStorage or defaults
export const timerState = signal(saveState(loadState(initialState)));

// Prepares timer for use, either continuing existing timer or setting up new one
export const initializeTimer = () => {
  console.clear();
  log('initializeTimer', timerState.value, 'black', 'white');

  // nothing more to do if timer has finished or is paused
  if (timerState.value.hasFinished || timerState.value.timePaused) return;

  if (timerState.value.runningIntervalId) { // continue the timer if it was running
    startTimer();
  } else { // set up fresh timer
    timerState.value = {
      ...timerState.value,
      durationRemaining: timerState.value.durationTotal, // set to full duration
    };
  }
};

// Starts the timer
export const startTimer = () => {
  // if fresh, set start time to now 
  let timeStarted = Date.now();

  // if paused, adjust start time by pause duration
  if (timerState.value.timePaused) {
    timeStarted += timerState.value.timeStarted - timerState.value.timePaused;
  }

  // if continuing running timer after page load, use existing start time
  if (timerState.value.runningIntervalId) {
    timeStarted = timerState.value.timeStarted;
  }

  timerState.value = {
    ...timerState.value,
    runningIntervalId: setInterval(tick, updatePeriod),
    timePaused: null, // only needed when resuming (starting from paused state)
    timeStarted,
  };
  log('(re)starting timer', timerState.value, 'green', 'white');
};

// Update function called by interval timer
const tick = () => {
  // Update remaining time based on start time and current time
  timerState.value = {
    ...timerState.value,
    durationRemaining: Math.max(
      0,
      timerState.value.timeStarted + timerState.value.durationTotal - Date.now()
    )
  };

  // Handle timer completion
  if (timerState.value.durationRemaining === 0) {
    clearInterval(timerState.value.runningIntervalId);

    timerState.value = {
      ...timerState.value,
      hasFinished: true,
      runningIntervalId: null,
    };
    log('timer finished', timerState.value, 'red', 'black');
  };
  log('tick', timerState.value, 'skyblue', 'black');
};

// Resets timer to initial state
export const resetTimer = () => {
  clearInterval(timerState.value.runningIntervalId);

  timerState.value = {
    ...initialState,
    durationRemaining: initialState.durationTotal
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
  if (timerState.value.hasFinished) return; // nothing to do if timer has finished
  timerState.value = {
    ...timerState.value,
    durationTotal: Math.max(0, timerState.value.durationTotal + durationDelta),
    durationRemaining: Math.max(0, timerState.value.durationRemaining + durationDelta),
  };
  log('duration adjusted', timerState.value, 'purple', 'white');
};

// Persists timer state to localStorage on every state change
effect(() => {
  saveState(timerState.value);
});

