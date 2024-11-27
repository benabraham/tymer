import {useEffect} from 'preact/hooks'
import {
    adjustDuration,
    adjustElapsed,
    finishCurrentPeriod,
    initializeTimer,
    initialState,
    pauseTimer,
    resetTimer,
    resumeTimer,
    startTimer,
    timerDuration,
    timerDurationElapsed,
    timerDurationRemaining,
    timerHasFinished,
    timerOnLastPeriod,
    timerState,
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

    const msToMinutes = (ms) => Math.floor(ms / 60000)

    const calculatePeriodSums = (periods) => {
        const totals = {
            totalDuration: 0,
            totalElapsed: 0,
            byType: {}
        }

        return periods.reduce((sum, period) => {
            // Sum all durations
            sum.totalDuration += period.periodDuration
            sum.totalElapsed += period.periodDurationElapsed
            sum.totalRemaining += period.periodDurationRemaining

            // Sum by type
            if (!sum.byType[period.type]) {
                sum.byType[period.type] = {
                    duration: 0,
                    durationElapsed: 0,
                    durationRemaining: 0,
                }
            }
            sum.byType[period.type].duration += period.periodDuration
            sum.byType[period.type].durationElapsed += period.periodDurationElapsed
            sum.byType[period.type].durationRemaining += period.periodDurationRemaining

            return sum
        }, totals)
    }

    const original = calculatePeriodSums(initialState.periods)
    const planned = calculatePeriodSums(timerState.value.periods)

    return (<>
        <div
            class="timeline"
            style={`
                --total-minutes: ${msToMinutes(timerDuration.value)};
            `}
        >
            {timerState.value.periods.map((period, index) => (<div
                key={index}
                class={`
                        timeline__period
                        timeline__period--${period.type}
                        ${index === timerState.value.currentPeriodIndex ? 'timeline__period--active' : ''}
                `}
                style={`
                        --period-minutes: ${msToMinutes(period.periodDuration)};
                `}
            >
                <div class="timeline__text">
                    {period.type} {formatTime(period.periodDuration)}
                </div>

                {index === timerState.value.currentPeriodIndex && (<div
                    class="timeline__current-time"
                    style={`
                        --elapsed-minutes: ${msToMinutes(period.periodDurationElapsed)};
                    `}
                >
                    <span class="timeline__elapsed">
                        {formatTime(timerDurationElapsed.value, true)}
                    </span>
                </div>)}
            </div>))}
        </div>

        <section class="controls">
            <div>Timer</div>
            <button
                onClick={() => adjustElapsed(-6 * 60 * 1000)}
                disabled={timerState.value.currentPeriodIndex === null || timerDurationElapsed.value === 0}
            >
                ◀ 6 min
            </button>
            <button
                onClick={() => adjustElapsed(-1 * 60 * 1000)}
                disabled={timerState.value.currentPeriodIndex === null || timerDurationElapsed.value === 0}
            >
                ◀ 1 min
            </button>
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
                onClick={() => adjustElapsed(1 * 60 * 1000)}
                disabled={timerState.value.currentPeriodIndex === null}
            >
                1 min ▶
            </button>
            <button
                onClick={() => adjustElapsed(6 * 60 * 1000)}
                disabled={timerState.value.currentPeriodIndex === null}
            >
                6 min ▶
            </button>
        </section>
        <section class="controls">
            <div>Period</div>
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
        </section>

        <div
            class="stats"
            style={`
                --break-original: ${msToMinutes(original.byType.break.duration)};
                --break-planned: ${msToMinutes(planned.byType.break.duration)};
                --break-elapsed: ${msToMinutes(planned.byType.break.durationElapsed)};

                --work-original: ${msToMinutes(original.byType.work.duration)};
                --work-planned: ${msToMinutes(planned.byType.work.duration)};
                --work-elapsed: ${msToMinutes(planned.byType.work.durationElapsed)};
            `}
        >
            <h2>Stats</h2>
            <div class="stats-bars">
                <div class="stats-bar stats-bar--break stats-bar--original">
                    <div class="stats-text">
                        break {formatTime(original.byType.break.duration)}
                    </div>
                </div>
                <div class="stats-bar stats-bar--break stats-bar--planned">
                    <div class="stats-text">
                        {formatTime(planned.byType.break.duration)}
                    </div>
                    <div
                        class={`
                            stats-elapsed
                            ${planned.byType.break.durationElapsed < 60000 ? 'stats-elapsed--none' : ''}
                        `}
                    >
                        <div class="stats-text stats-elapsed-text">
                            {
                                planned.byType.break.duration !== planned.byType.break.durationElapsed
                                    ? formatTime(planned.byType.break.durationElapsed)
                                    : ''
                            }
                        </div>
                    </div>
                </div>
                <div class="stats-bar stats-bar--work stats-bar--original">
                    <div class="stats-text">
                        work {formatTime(original.byType.work.duration)}
                    </div>
                </div>
                <div class="stats-bar stats-bar--work stats-bar--planned">
                    <div class="stats-text">
                        {formatTime(planned.byType.work.duration)}
                    </div>
                    <div
                        class={`
                            stats-elapsed
                            ${planned.byType.work.durationElapsed < 60000 ? 'stats-elapsed--none' : ''}
                        `}
                    >
                        <div class="stats-text stats-elapsed-text">
                            {
                                planned.byType.work.duration !== planned.byType.work.durationElapsed
                                    ? formatTime(planned.byType.work.durationElapsed)
                                    : ''
                            }
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <details>
            <summary>Debugging values</summary>
            <p>
                <code>timerDuration</code> {formatTime(timerDuration.value, false, true)}<br/>
                <code>timerDurationElapsed </code> {formatTime(timerDurationElapsed.value, true, true)}<br/>
                <code>timerDurationRemaining </code> {formatTime(timerDurationRemaining.value, false, true)}<br/>
                <code>currentPeriodIndex </code> {timerState.value.currentPeriodIndex}<br/>
                <code>timestampStarted </code> {(timerState.value.timestampStarted || 0).toLocaleString()}<br/>
                <code>timestampPaused </code> {(timerState.value.timestampPaused || 0).toLocaleString()}<br/>
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
