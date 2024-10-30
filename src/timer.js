import { signal, computed, effect } from '@preact/signals';
import { saveState, loadState } from './storage';
import { log } from './util';


// Time in milliseconds between timer updates
const updatePeriod = 500;

// Default timer configuration
const initialState = {
  durationRemaining: null,  // milliseconds remaining on timer
  durationTotal: 30 * 1000, // total duration of timer in milliseconds
  hasFinished: false,       // if timer has completed
  hasStarted: false,        // if timer has been started
  isPaused: false,          // paused state
  runningIntervalId: null,  // ID of the interval timer, null when not running
  timePaused: null,         // timestamp when timer was paused
  timeStarted: null,        // timestamp when timer was started
};

// Main timer state signal, initialized from localStorage or defaults
export const timerState = signal(loadState(initialState));

// Prepares timer for use, either continuing existing timer or setting up new one
export const initializeTimer = () => {
  console.clear();
  log('initializeTimer', timerState.value, 'black', 'white');

  if (timerState.value.hasFinished) return; // nothing more to do if timer has finished

  if (timerState.value.runningIntervalId) { // continue the timer if it was running
    timerState.value = {
      ...timerState.value,
      runningIntervalId: setInterval(tick, updatePeriod), // by starting new interval
    };
    log('continuing timer', timerState.value, 'darkgreen', 'white');
  } else if (!timerState.value.timePaused) { // Fresh timer (not paused)
    timerState.value = {
      ...timerState.value,
      durationRemaining: timerState.value.durationTotal, // set to full duration
    };
  }
};

// Starts the timer
export const startTimer = () => {
  if (timerState.value.runningIntervalId) return; // do nothing if timer is already running

  timerState.value = {
    ...timerState.value,
    hasStarted: true,
    isPaused: false,
    runningIntervalId: setInterval(tick, updatePeriod),
    timePaused: null,  // Clear pause timestamp
    timeStarted: timerState.value.isPaused
      ? timerState.value.timeStarted + (Date.now() - timerState.value.timePaused) // Adjust start time by pause duration
      : Date.now(),
  };
  log('start Timer', timerState.value, 'green', 'white');
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

// Converts milliseconds to human-readable format
export const formattedTime = computed(() => {
  const seconds = Math.ceil(timerState.value.durationRemaining / 1000);
  return `${timerState.value.durationRemaining} (${seconds} s)`;
});

// Calculates remaining time based on start time and current time
const updateRemainingTime = () => {
  const newTimeRemaining = Math.max(
    0,
    timerState.value.timeStarted + timerState.value.durationTotal - Date.now()
  );
  log('newTimeRemaining', newTimeRemaining, 'gray', 'black');

  timerState.value = {
    ...timerState.value,
    durationRemaining: newTimeRemaining
  };
};

// Handles timer completion
const finishTimer = () => {
  clearInterval(timerState.value.runningIntervalId);

  timerState.value = {
    ...timerState.value,
    hasFinished: true,
    runningIntervalId: null,
  };
  log('timer finished', timerState.value, 'red', 'black');
};

// Pauses the timer
export const pauseTimer = () => {
  if (!timerState.value.runningIntervalId) return;

  clearInterval(timerState.value.runningIntervalId);

  timerState.value = {
    ...timerState.value,
    isPaused: true,
    runningIntervalId: null,
    timePaused: Date.now(),  // Store when we paused
  };
  log('timer paused', timerState.value, 'goldenrod', 'black');
};

// Update function called by interval timer
const tick = () => {
  updateRemainingTime();

  log('tick', timerState.value, 'skyblue', 'black');

  if (timerState.value.durationRemaining === 0) {
    finishTimer();
  };
};

// Persists timer state to localStorage on every state change
effect(() => {
  saveState(timerState.value);
});
