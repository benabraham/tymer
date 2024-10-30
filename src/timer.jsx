import { useEffect } from 'preact/hooks';
import {
  timerState,
  formattedTime,
  startTimer,
  resetTimer,
  initializeTimer
} from './timer';

export function Timer() {
  // Initialize timer when component mounts
  useEffect(() => {
    initializeTimer();
  }, []);

  // Starts timer if not already running
  const handleStart = () => {
    startTimer();
  };

  // Resets timer to initial state
  const handleReset = () => {
    resetTimer();
  };

  return (
    <>
      <h1>Linear Pomodoro Timer</h1>
      <p>
        {timerState.value.hasFinished
          ? `Finished!`
          : `Time remaining: ${formattedTime.value}`}
      </p>
      <button
        onClick={handleStart}
        disabled={timerState.value.hasStarted}
      >
        Start
      </button>
      <button
        onClick={handleReset}
        disabled={!timerState.value.hasStarted}
      >
        Reset
      </button>
    </>
  );
}
