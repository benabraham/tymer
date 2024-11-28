import {useEffect} from 'preact/hooks'
import {useComputed} from '@preact/signals'
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
    timerHasFinished,
    timerOnLastPeriod,
    timerState,
} from './timer'

export function Timer() {
    // initialize timer when component mounts
    useEffect(() => {
        initializeTimer()
    }, [])

    // computed signals
    const timerDuration = useComputed(() => timerState.value.periods.reduce((sum, period) => sum + period.periodDuration, 0))
    const timerDurationElapsed = useComputed(() => timerState.value.periods.reduce((sum, period) => sum + period.periodDurationElapsed, 0))
    const timerDurationRemaining = useComputed(() => timerState.value.periods.reduce((sum, period) => sum + period.periodDurationRemaining, 0))
    const currentPeriod = useComputed(() => timerState.value.periods[timerState.value.currentPeriodIndex])

    // combined handler for start/pause/resume
    const handleStartPause = () => {
        if (timerState.value.runningIntervalId) {
            pauseTimer()
        } else if (timerState.value.timestampPaused) {
            resumeTimer()
        } else {
            startTimer()
        }
    }

    // converts milliseconds to human-readable format
    const formatTime = (ms, floor, debug) => {
        // handle null/undefined input
        if (ms == null) return '–––'

        const totalSeconds = floor ? Math.floor(ms / 1000) : Math.ceil(ms / 1000)
        const hours = Math.floor(totalSeconds / 3600)
        const minutes = Math.floor((totalSeconds % 3600) / 60)
        const seconds = totalSeconds % 60

        const pad = (num, places = 2, fillChar = '0') => num.toString().padStart(places, fillChar)
        if (debug) return `${pad(hours)}:${pad(minutes)}:${pad(seconds)} ${pad(ms, 6, ' ')} ms`
        return `${hours}:${pad(minutes)}`
    }

    // converts milliseconds to minutes (rounding down by milliseconds)
    const msToMinutes = (ms) => Math.floor(ms / 60000)

    // prepare data for Stats
    const calculateTypeSums = ({periods, type}) => {
        const sumByKey = (key) => periods.reduce((sum, period) => period.type === type ? sum + period[key] : sum, 0)

        return {
            duration: sumByKey('periodDuration'),
            durationElapsed: sumByKey('periodDurationElapsed'),
            durationRemaining: sumByKey('periodDurationRemaining'),
        }
    }

    const calculatePeriodSums = ({initialPeriods, currentPeriods}) => {
        const calculateFor = (periods) => (type) => calculateTypeSums({periods, type})

        const types = ['work', 'break']
        return types.reduce((acc, type) => ({
            ...acc, [type]: {
                original: calculateFor(initialPeriods)(type), current: calculateFor(currentPeriods)(type)
            }
        }), {})
    }

    const periodSums = calculatePeriodSums({
        initialPeriods: initialState.periods, currentPeriods: timerState.value.periods
    })

    // template
    return (<>
        <div
            class="timeline"
            style={`--total-minutes: ${msToMinutes(timerDuration.value)};`}
        >
            {timerState.value.periods.map((period, index) => (<div
                key={index}
                class={`
                        timeline__period
                        timeline__period--${period.type}
                        ${index === timerState.value.currentPeriodIndex ? 'timeline__period--active' : ''}
                `}
                style={`--period-minutes: ${msToMinutes(period.periodDuration)};`}
            >
                <div class="timeline__text">
                    {period.type} {formatTime(period.periodDuration)}
                </div>

                {index === timerState.value.currentPeriodIndex && (<div
                    class="timeline__current-time"
                    style={`--elapsed-minutes: ${msToMinutes(period.periodDurationElapsed)};`}
                >
                    <span class="timeline__elapsed timeline__elapsed--period">
                        {formatTime(currentPeriod.value.periodDurationElapsed, true)}
                        <span class="timeline__symbol"> ◀▶ </span>
                        {formatTime(currentPeriod.value.periodDurationRemaining)}
                    </span>
                    <span class="timeline__elapsed timeline__elapsed--timer">
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
                --break-original: ${msToMinutes(periodSums.break.original.duration)};
                --break-planned: ${msToMinutes(periodSums.break.current.duration)};
                --break-elapsed: ${msToMinutes(periodSums.break.current.durationElapsed)};
            
                --work-original: ${msToMinutes(periodSums.work.original.duration)};
                --work-planned: ${msToMinutes(periodSums.work.current.duration)};
                --work-elapsed: ${msToMinutes(periodSums.work.current.durationElapsed)};
            `}
        >
            <h2>Stats</h2>
            <div class="stats-bars">
                <div class="stats-bar stats-bar--break stats-bar--original">
                    <div class="stats-text">
                        break {formatTime(periodSums.break.original.duration)}
                    </div>
                </div>
                <div class="stats-bar stats-bar--break stats-bar--planned">
                    <div class="stats-text">
                        {formatTime(periodSums.break.current.duration)}
                    </div>
                    <div
                        class={`
                            stats-elapsed
                            ${periodSums.break.current.durationElapsed < 60000 ? 'stats-elapsed--none' : ''}
                        `}
                    >
                        <div class="stats-text stats-elapsed-text">
                            {
                                periodSums.break.current.duration !== periodSums.break.current.durationElapsed
                                    ? formatTime(periodSums.break.current.durationElapsed)
                                    : ''
                            }
                        </div>
                    </div>
                </div>
                <div class="stats-bar stats-bar--work stats-bar--original">
                    <div class="stats-text">
                        work {formatTime(periodSums.work.original.duration)}
                    </div>
                </div>
                <div class="stats-bar stats-bar--work stats-bar--planned">
                    <div class="stats-text">
                        {formatTime(periodSums.work.current.duration)}
                    </div>
                    <div
                        class={`
                            stats-elapsed
                            ${periodSums.work.current.durationElapsed < 60000 ? 'stats-elapsed--none' : ''}
                        `}
                    >
                        <div class="stats-text stats-elapsed-text">
                            {
                                periodSums.work.current.duration !== periodSums.work.current.durationElapsed
                                    ? formatTime(periodSums.work.current.durationElapsed)
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
                        <div class="tempPeriod__data">{formatTime(period.periodDuration, false, true)}</div>
                        <div class="tempPeriod__data">{formatTime(period.periodDurationRemaining, false, true)}</div>
                        <div class="tempPeriod__data">{formatTime(period.periodDurationElapsed, true, true)}</div>
                        <div class="tempPeriod__data">{period.periodHasFinished ? 'yes' : 'no'}</div>
                    </div>
                ))}
            </div>
        </details>
    </>)
}
