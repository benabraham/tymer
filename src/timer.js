import { signal, computed, effect } from '@preact/signals';
import { saveState, loadState } from './storage';
import { log } from './util';


// Time in milliseconds between timer updates
const updatePeriod = 500;

// Default timer configuration
const initialState = {
  hasFinished: false,      // Flag indicating if timer has completed
  hasStarted: false,       // Flag indicating if timer has been started
  runningIntervalId: null, // ID of the interval timer, null when not running
  startTime: null,         // Timestamp when timer was started
  timeRemaining: null,     // Milliseconds remaining on timer
  timerDuration: 30 * 1000, // Total duration in milliseconds
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
  } else { // prepare timer for use
    timerState.value = {
      ...timerState.value,
      timeRemaining: timerState.value.timerDuration,
    };
  }
};

// Starts the timer
export const startTimer = () => {
  if (timerState.value.runningIntervalId) return; // do nothing if timer is already running

  timerState.value = {
    ...timerState.value,
    hasStarted: true,
    startTime: Date.now(),
    runningIntervalId: setInterval(tick, updatePeriod),
  };
  log('start Timer', timerState.value, 'green', 'white');
};

// Resets timer to initial state
export const resetTimer = () => {
  clearInterval(timerState.value.runningIntervalId);

  timerState.value = {
    ...initialState,
    timeRemaining: initialState.timerDuration
  };
  log('timer reset', timerState.value, 'orange', 'black');
};

// Converts milliseconds to human-readable format
export const formattedTime = computed(() => {
  const seconds = Math.ceil(timerState.value.timeRemaining / 1000);
  return `${timerState.value.timeRemaining} (${seconds} s)`;
});

// Calculates remaining time based on start time and current time
const updateRemainingTime = () => {
  const newTimeRemaining = Math.max(
    0,
    timerState.value.startTime + timerState.value.timerDuration - Date.now()
  );
  log('newTimeRemaining', newTimeRemaining, 'gray', 'black');

  timerState.value = {
    ...timerState.value,
    timeRemaining: newTimeRemaining
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

// Update function called by interval timer
const tick = () => {
  updateRemainingTime();

  log('tick', timerState.value, 'skyblue', 'black');

  if (timerState.value.timeRemaining === 0) {
    finishTimer();
  };
};

// Persists timer state to localStorage on every state change
effect(() => {
  saveState(timerState.value);
});
