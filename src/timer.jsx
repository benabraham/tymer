import { useEffect } from 'preact/hooks';
import {
  timerState,
  startTimer,
  resetTimer,
  initializeTimer,
  pauseTimer,
  adjustDuration,
  initialState,
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

  // Converts milliseconds to human-readable format
  const formatTime = (ms) => {
    const totalSeconds = Math.ceil(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const pad = (num) => num.toString().padStart(2, '0');
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)} 
    (${ms} ms)`;
  }

  return (
    <>
      <h1>Linear Pomodoro Timer</h1>
      <p>
        {timerState.value.hasFinished
          ? `Finished!`
          : `Time remaining ${formatTime(timerState.value.durationRemaining)}`}
      </p>

      <button
        onClick={handleStartPause}
        disabled={timerState.value.hasFinished || !timerState.value.durationRemaining}
      >
        {timerState.value.runningIntervalId ? 'Pause' : (timerState.value.timePaused ? 'Resume' : 'Start')}
      </button>
      <button
        onClick={handleReset}
        disabled={
          initialState.durationTotal === timerState.value.durationTotal
          && !timerState.value.timeStarted 
          && timerState.value.durationRemaining !== 0
        }
      >
        Reset
      </button>
      <button
        onClick={() => adjustDuration(-6 * 60 * 1000)}
        disabled={timerState.value.hasFinished || !timerState.value.durationRemaining}
      >
        -6 min
      </button>
      <button
        onClick={() => adjustDuration(-60 * 1000)}
        disabled={timerState.value.hasFinished || !timerState.value.durationRemaining}
      >
        -1 min
      </button>
      <button
        onClick={() => adjustDuration(60 * 1000)}
        disabled={timerState.value.hasFinished}
      >
        +1 min
      </button>
      <button
        onClick={() => adjustDuration(6 * 60 * 1000)}
        disabled={timerState.value.hasFinished}
      >
        +6 min
      </button>
      <p>Total elapsed {formatTime(timerState.value.timeElapsed)}</p>
    </>
  );
}
