import {useEffect} from 'preact/hooks'
import {formatTime, msToMinutes} from './format.js'
import {
    adjustDuration,
    adjustElapsed,
    currentPeriod,
    handlePeriodCompletion,
    handleTimerCompletion,
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
    // initialize timer when component mounts
    useEffect(() => {
        initializeTimer()
    }, [])

    return (<>
        <Timeline />
        <TimerControls />
        <PeriodControls />
        <Stats />
        <DebuggingInfo />
    </>)
}


export const Timeline = () => {
    return (
        <div
            class="timeline"
            style={`--total-minutes: ${msToMinutes(timerDuration.value)};`}
        >
            {timerState.value.periods.map((period, index) => (
                <TimelinePeriod
                    key={index}
                    period={period}
                    isActive={index === timerState.value.currentPeriodIndex}
                />
            ))}
        </div>
    )
}

// Timeline Period Sub-Component
const TimelinePeriod = ({ period, isActive }) => {
    return (
        <div
            class={`
                timeline__period
                timeline__period--${period.type}
                ${isActive ? 'timeline__period--active' : ''}
            `}
            style={`--period-minutes: ${msToMinutes(period.periodDuration)};`}
        >
            <div class="timeline__text">
                {period.type} {formatTime(period.periodDuration)}
            </div>

            {isActive && <TimelinePeriodDetails period={period} />}
        </div>
    )
}

// Timeline Period Details Sub-Component
const TimelinePeriodDetails = ({ period }) => (
    <>
        <div
            class="timeline__current-time"
            style={`--elapsed-minutes: ${msToMinutes(period.periodDurationElapsed)};`}
        >
            <span class="timeline__elapsed timeline__elapsed--period">
                {formatTime(currentPeriod.value.periodDurationElapsed, true)}
                <span class="timeline__symbol"> ◀▶ </span>
                {formatTime(currentPeriod.value.periodDurationRemaining)}
            </span>
            <span class="timeline__elapsed timeline__elapsed--timer">
                {formatTime(
                    timerState.value.periods.reduce((sum, p) => sum + p.periodDurationElapsed, 0),
                    true
                )}
            </span>
        </div>
        <div class="timeline__subinterval"></div>
    </>
)

// Timer Controls Component
const TimerControls = () => {
    const handleStartPause = () => {
        if (timerState.value.runningIntervalId) {
            pauseTimer()
        } else if (timerState.value.timestampPaused) {
            resumeTimer()
        } else {
            startTimer()
        }
    }

    return (
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
                disabled={
                    initialState.timerDuration === timerDuration.value &&
                    !timerState.value.timestampStarted &&
                    timerDurationRemaining.value !== 0
                }
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
    )
}

// Period Controls Component
const PeriodControls = () => (
    <section class="controls">
        <div>Period</div>
        <button
            onClick={() => adjustDuration(-6 * 60 * 1000)}
            disabled={
                timerHasFinished.value ||
                timerState.value.currentPeriodIndex === null ||
                !timerState.value.periods.some(p => p.periodDurationRemaining > 0)
            }
        >
            -6 min
        </button>
        <button
            onClick={() => adjustDuration(-60 * 1000)}
            disabled={
                timerHasFinished.value ||
                timerState.value.currentPeriodIndex === null ||
                !timerState.value.periods.some(p => p.periodDurationRemaining > 0)
            }
        >
            -1 min
        </button>
        <button
            onClick={handlePeriodCompletion}
            disabled={
                timerHasFinished.value ||
                timerState.value.currentPeriodIndex === null ||
                timerOnLastPeriod.value
            }
            class={!timerOnLastPeriod.value && timerState.value.shouldGoToNextPeriod ? 'highlighted' : ''}
        >
            Next
        </button>
        <button
            onClick={handleTimerCompletion}
            disabled={
                timerHasFinished.value ||
                timerState.value.currentPeriodIndex === null
            }
            class={timerOnLastPeriod.value && timerState.value.shouldGoToNextPeriod ? 'highlighted' : ''}
        >
            Finish
        </button>
        <button
            onClick={() => adjustDuration(60 * 1000)}
            disabled={
                timerHasFinished.value ||
                timerState.value.currentPeriodIndex === null
            }
        >
            +1 min
        </button>
        <button
            onClick={() => adjustDuration(6 * 60 * 1000)}
            disabled={
                timerHasFinished.value ||
                timerState.value.currentPeriodIndex === null
            }
        >
            +6 min
        </button>
    </section>
)

// Stats Component
const Stats = () => {
    const calculateTypeSums = ({periods, type}) => {
        const sumByKey = (key) => periods.reduce((sum, period) =>
            period.type === type ? sum + period[key] : sum, 0
        )

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
            ...acc,
            [type]: {
                original: calculateFor(initialPeriods)(type),
                current: calculateFor(currentPeriods)(type)
            }
        }), {})
    }

    const periodSums = calculatePeriodSums({
        initialPeriods: initialState.periods,
        currentPeriods: timerState.value.periods
    })

    return (
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
            <StatsBars periodSums={periodSums} />
        </div>
    )
}

// Stats Bars Sub-Component
const StatsBars = ({ periodSums }) => {
    const renderStatBar = (type, variant) => {
        const periodData = periodSums[type][variant]
        const isElapsed = variant === 'current'
        const showElapsed = isElapsed && periodData.duration !== periodData.durationElapsed

        return (
            <div class={`stats-bar stats-bar--${type} stats-bar--${variant}`}>
                <div class="stats-text">
                    {isElapsed ? formatTime(periodData.duration) : `${type} ${formatTime(periodData.duration)}`}
                </div>
                {showElapsed && (
                    <div
                        class={`
                            stats-elapsed
                            ${periodData.durationElapsed < 60000 ? 'stats-elapsed--none' : ''}
                        `}
                    >
                        <div class="stats-text stats-elapsed-text">
                            {formatTime(periodData.durationElapsed)}
                        </div>
                    </div>
                )}
            </div>
        )
    }

    return (
        <div class="stats-bars">
            {renderStatBar('break', 'original')}
            {renderStatBar('break', 'current')}
            {renderStatBar('work', 'original')}
            {renderStatBar('work', 'current')}
        </div>
    )
}

// Debugging Component
const DebuggingInfo = () => {
    return (
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

            <PeriodDetails />
        </details>
    )
}

// Detailed Period Information Sub-Component
const PeriodDetails = () => (
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
)
