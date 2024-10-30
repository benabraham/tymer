import { useEffect } from 'preact/hooks';
import {
  timerState,
  formattedTime,
  startTimer,
  resetTimer,
  initializeTimer,
  pauseTimer
} from './timer';

export function Timer() {
  // Initialize timer when component mounts
  useEffect(() => {
    initializeTimer();
  }, []);

  // Combined handler for start/pause/resume
  const handleStartPause = () => {
    if (timerState.value.runningIntervalId) {
      pauseTimer();
    } else {
      startTimer();
    }
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
        onClick={handleStartPause}
        disabled={timerState.value.hasFinished}
      >
        {timerState.value.runningIntervalId ? 'Pause' : (timerState.value.timePaused ? 'Resume' : 'Start')}
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
