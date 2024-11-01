import { useEffect } from 'preact/hooks';
import {
  timerState,
  startTimer,
  resetTimer,
  initializeTimer,
  pauseTimer,
  adjustDuration,
  initialState,
  timerDurationRemaining,
  timerDuration,
  timerDurationElapsed,
  timerHasFinished,
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
  const formatTime = (ms, floor) => {
    // Handle null/undefined input
    if (ms == null) return '–––';

    const totalSeconds = floor ? Math.floor(ms / 1000) : Math.ceil(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const pad = (num, places = 2, fillChar = '0') =>
      num.toString().padStart(places, fillChar);

    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)} ${pad(ms, 6, ' ')} ms`;
  }

  return (
    <>
      <p>
        <code>timerDuration          </code> {formatTime(timerDuration.value)}<br />
        <code>timerDurationElapsed   </code> {formatTime(timerDurationElapsed.value, true)}<br />
        <code>timerDurationRemaining </code> {formatTime(timerDurationRemaining.value)}<br />
        <code>currentPeriodIndex     </code> {timerState.value.currentPeriodIndex}
      </p>
      <p>
        {timerHasFinished.value
          ? `Finished!`
          : `Time remaining ${formatTime(timerDurationRemaining.value)}`}
      </p>

      <button
        onClick={handleStartPause}
        disabled={timerHasFinished.value || !timerDurationRemaining.value}
      >
        {timerState.value.runningIntervalId ? 'Pause' : (timerState.value.timePaused ? 'Resume' : 'Start')}
      </button>
      <button
        onClick={handleReset}
        disabled={
          initialState.timerDuration === timerDuration.value
          && !timerState.value.timeStarted
          && timerDurationRemaining.value !== 0
        }
      >
        Reset
      </button>
      <button
        onClick={() => adjustDuration(-6 * 60 * 1000)}
        disabled={timerHasFinished.value || !timerDurationRemaining.value}
      >
        -6 min
      </button>
      <button
        onClick={() => adjustDuration(-60 * 1000)}
        disabled={timerHasFinished.value || !timerDurationRemaining.value}
      >
        -1 min
      </button>
      <button
        onClick={() => adjustDuration(60 * 1000)}
        disabled={timerHasFinished.value}
      >
        +1 min
      </button>
      <button
        onClick={() => adjustDuration(6 * 60 * 1000)}
        disabled={timerHasFinished.value}
      >
        +6 min
      </button>

      <div class="tempPeriods">
        <div class="tempPeriod">
          <div class="tempPeriod__data">Type</div>
          <div class="tempPeriod__data">Duration</div>
          <div class="tempPeriod__data">Remaining</div>
          <div class="tempPeriod__data">Elapsed</div>
          <div class="tempPeriod__data">Finished</div>
        </div>
        {timerState.value.periods.map((period, index) => (
          <div
            key={index}
            class={`
              tempPeriod 
              ${index === timerState.value.currentPeriodIndex ? 'tempPeriod--current' : ''}
              ${period.periodHasFinished ? 'tempPeriod--finished' : ''}
              `}
          >
            <div class="tempPeriod__data">{period.type}</div>
            <div class="tempPeriod__data">{formatTime(period.periodDuration)}</div>
            <div class="tempPeriod__data">{formatTime(period.periodDurationRemaining)}</div>
            <div class="tempPeriod__data">{formatTime(period.periodDurationElapsed, true)}</div>
            <div class="tempPeriod__data">{period.periodHasFinished ? 'yes' : 'no'}</div>
          </div>
        ))}
      </div>
    </>
  );
}
