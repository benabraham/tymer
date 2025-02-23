import {
    adjustElapsed,
    timerState,
    timerDurationElapsed,
    timerHasFinished,
    timerDurationRemaining,
    initialState,
    timerDuration,
    timerOnLastPeriod,
    handleTimerCompletion,
    pauseTimer,
    resumeTimer,
    startTimer,
    resetTimer
} from '../../../timer'

export const TimerControls = () => {
    const handleStartPause = () => {
        if (timerState.value.runningIntervalId) pauseTimer()
        else if (timerState.value.timestampPaused) resumeTimer()
        else startTimer()
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