import { useEffect } from 'preact/hooks'
import { useComputed } from '@preact/signals'
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
  timerOnLastPeriod,
  finishCurrentPeriod,
  TIMER_SCALE,
} from './timer'

export function Timer() {
  // Initialize timer when component mounts
  useEffect(() => {
    initializeTimer()
  }, [])

  // Combined handler for start/pause/resume
  const handleStartPause = () => {
    if (timerState.value.runningIntervalId) {
      pauseTimer()
    } else {
      startTimer()
    }
  }

  // Converts milliseconds to human-readable format
  const formatTime = (ms, floor) => {
    // Handle null/undefined input
    if (ms == null) return '–––'

    const totalSeconds = floor ? Math.floor(ms / 1000) : Math.ceil(ms / 1000)
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = totalSeconds % 60

    const pad = (num, places = 2, fillChar = '0') =>
      num.toString().padStart(places, fillChar)

    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)} ${pad(ms, 6, ' ')} ms`
  }

  return (
    <>
      <div
        class="timer"
        style={{
          gridTemplateColumns: `repeat(${useComputed(() => timerState.value.periods.reduce((sum, period) => sum + (period.periodDuration > 0 ? Math.ceil(period.periodDuration / TIMER_SCALE) : 2), 0))}, 1fr)`,
        }}
      >
        {timerState.value.periods.map((period, index) => (
          <div
            key={index}
            class={`
            period
            period--${period.type}
            ${index === timerState.value.currentPeriodIndex
                ? 'period--active'
                : ''
              }
          `}
          style={{ gridColumnStart: `span ${period.periodDuration > 0 ? Math.ceil(period.periodDuration / TIMER_SCALE) : 2 }` }}

          >
            <div class="period-text">
              {formatTime(period.periodDuration)}
            </div>

            {index === timerState.value.currentPeriodIndex && (
              <div
                class="current-time"
                style={{
                  width: `${(timerState.value.periods[timerState.value.currentPeriodIndex].periodDurationElapsed / timerState.value.periods[timerState.value.currentPeriodIndex].periodDuration * 100)
                    }%`
                }}
              ></div>
            )}
          </div>
        ))}
      </div>

      <section class="controls">
        <button
          onClick={handleStartPause}
          disabled={timerHasFinished.value || !timerDurationRemaining.value}
        >
          {timerState.value.runningIntervalId ? 'Pause' : (timerState.value.timestampPaused ? 'Resume' : 'Start')}
        </button>
        <button
          onClick={resetTimer}
          disabled={
            initialState.timerDuration === timerDuration.value
            && !timerState.value.timestampStarted
            && timerDurationRemaining.value !== 0
          }
          class={timerHasFinished.value ? 'highlighted' : ''}
        >
          Reset
        </button>
        <button
          onClick={() => adjustDuration(-6 * 60 * 1000)}
          disabled={timerHasFinished.value || timerState.value.currentPeriodIndex === null || !timerDurationRemaining.value}
        >
          -6 min
        </button>
        <button
          onClick={() => adjustDuration(-60 * 1000)}
          disabled={timerHasFinished.value || timerState.value.currentPeriodIndex === null || !timerDurationRemaining.value}
        >
          -1 min
        </button>
        <button
          onClick={() => adjustDuration(60 * 1000)}
          disabled={timerHasFinished.value || timerState.value.currentPeriodIndex === null}
        >
          +1 min
        </button>
        <button
          onClick={() => adjustDuration(6 * 60 * 1000)}
          disabled={timerHasFinished.value || timerState.value.currentPeriodIndex === null}
        >
          +6 min
        </button>
        <button
          onClick={finishCurrentPeriod}
          disabled={timerHasFinished.value || timerState.value.currentPeriodIndex === null || timerOnLastPeriod.value}
          class={!timerOnLastPeriod.value && timerState.value.shouldGoToNextPeriod ? 'highlighted' : ''}
        >
          Next
        </button>
        <button
          onClick={() => finishCurrentPeriod(true)}
          disabled={timerHasFinished.value || timerState.value.currentPeriodIndex === null}
          class={timerOnLastPeriod.value && timerState.value.shouldGoToNextPeriod ? 'highlighted' : ''}
        >
          Finish
        </button>
      </section>

      <p>
        <code>timerDuration          </code> {formatTime(timerDuration.value)}<br />
        <code>timerDurationElapsed   </code> {formatTime(timerDurationElapsed.value, true)}<br />
        <code>timerDurationRemaining </code> {formatTime(timerDurationRemaining.value)}<br />
        <code>currentPeriodIndex     </code> {timerState.value.currentPeriodIndex}<br />
        <code>shouldGoToNextPeriod   </code> {timerState.value.shouldGoToNextPeriod ? 'YES' : 'no'}<br />
        <code>timerOnLastPeriod      </code> {timerOnLastPeriod.value ? 'YES' : 'no'}<br />
        <code>timerHasFinished       </code> {timerHasFinished.value ? 'YES' : 'no'}
      </p>

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
  )
}
