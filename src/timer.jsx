import {useEffect} from 'preact/hooks'
import {useComputed} from '@preact/signals'
import {
    timerState, startTimer, resumeTimer, resetTimer, initializeTimer, pauseTimer, adjustDuration, initialState, timerDurationRemaining, timerDuration, timerDurationElapsed, timerHasFinished, timerOnLastPeriod, finishCurrentPeriod,
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
        } else if (timerState.value.timestampPaused) {
            resumeTimer()
        } else {
            startTimer()
        }
    }

    // Converts milliseconds to human-readable format
    const formatTime = (ms, floor, debug) => {
        // Handle null/undefined input
        if (ms == null) return '–––'

        const totalSeconds = floor ? Math.floor(ms / 1000) : Math.ceil(ms / 1000)
        const hours = Math.floor(totalSeconds / 3600)
        const minutes = Math.floor((totalSeconds % 3600) / 60)
        const seconds = totalSeconds % 60

        const pad = (num, places = 2, fillChar = '0') => num.toString().padStart(places, fillChar)
        if (debug) return `${pad(hours)}:${pad(minutes)}:${pad(seconds)} ${pad(ms, 6, ' ')} ms`
        return `${hours}:${pad(minutes)}`
    }

    const gridColumnsScale = 1000;

    return (<>
        <div
            class="timer"
            style={{
                gridTemplateColumns: `repeat(${useComputed(() => timerState.value.periods.reduce((sum, period) => sum + (period.periodDuration ? Math.ceil(period.periodDuration / gridColumnsScale) : 2), 0))}, 1fr)`,
            }}
        >
            {timerState.value.periods.map((period, index) => (<div
                key={index}
                class={`
            period
            period--${period.type}
            ${index === timerState.value.currentPeriodIndex ? 'period--active' : ''}
          `}
                style={{gridColumnStart: `span ${period.periodDuration ? Math.ceil(period.periodDuration / gridColumnsScale) : 2}`}}
            >
                <div class="period-text">
                    {period.type} {formatTime(period.periodDuration)}
                </div>

                {index === timerState.value.currentPeriodIndex && (<div
                    class="current-time"
                    style={{
                        width: `${(timerState.value.periods[timerState.value.currentPeriodIndex].periodDurationElapsed / timerState.value.periods[timerState.value.currentPeriodIndex].periodDuration * 100)}%`
                    }}
                >
                <span class={`
                  period-elapsed
                  ${(timerState.value.periods[timerState.value.currentPeriodIndex].periodDurationElapsed / timerState.value.periods[timerState.value.currentPeriodIndex].periodDuration) > 0.5 ? 'period-elapsed--half' : ''}
                  `}>
                  {formatTime(timerDurationElapsed.value, true)}
                </span>
                </div>)}
            </div>))}
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
                disabled={initialState.timerDuration === timerDuration.value && !timerState.value.timestampStarted && timerDurationRemaining.value !== 0}
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
        <details>
            <summary>Debugging values</summary>
            <p>
                <code>timerDuration </code> {formatTime(timerDuration.value, false, true)}<br/>
                <code>timerDurationElapsed </code> {formatTime(timerDurationElapsed.value, true, true)}<br/>
                <code>timerDurationRemaining </code> {formatTime(timerDurationRemaining.value, false, true)}<br/>
                <code>currentPeriodIndex </code> {timerState.value.currentPeriodIndex}<br/>
                <code>shouldGoToNextPeriod </code> {timerState.value.shouldGoToNextPeriod ? 'YES' : 'no'}<br/>
                <code>timerOnLastPeriod </code> {timerOnLastPeriod.value ? 'YES' : 'no'}<br/>
                <code>timerHasFinished </code> {timerHasFinished.value ? 'YES' : 'no'}
            </p>

            <div class="tempPeriods">
                <div class="tempPeriod">
                    <div class="tempPeriod__data">Type</div>
                    <div class="tempPeriod__data">Duration</div>
                    <div class="tempPeriod__data">Remaining</div>
                    <div class="tempPeriod__data">Elapsed</div>
                    <div class="tempPeriod__data">Finished</div>
                </div>
                {timerState.value.periods.map((period, index) => (<div
                    key={index}
                    class={`
              tempPeriod 
              ${index === timerState.value.currentPeriodIndex ? 'tempPeriod--current' : ''}
              ${period.periodHasFinished ? 'tempPeriod--finished' : ''}
              `}
                >
                    <div class="tempPeriod__data">{period.type}</div>
                    <div class="tempPeriod__data">{formatTime(period.periodDuration, false, true)}</div>
                    <div class="tempPeriod__data">{formatTime(period.periodDurationRemaining, false, true)}</div>
                    <div class="tempPeriod__data">{formatTime(period.periodDurationElapsed, true, true)}</div>
                    <div class="tempPeriod__data">{period.periodHasFinished ? 'yes' : 'no'}</div>
                </div>))}
            </div>
        </details>
    </>)
}
