import {
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
    resetTimer,
    moveToNextPeriod,
    moveToPreviousPeriod,
} from '../../../lib/timer'

export const TimerControls = () => {
    const handleStartPause = () => {
        if (timerState.value.runningIntervalId) pauseTimer()
        else if (timerState.value.timestampPaused) resumeTimer()
        else startTimer()
    }

    return (
        <section class="controls">
            <button
                onClick={moveToPreviousPeriod}
                disabled={
                    timerHasFinished.value
                    || timerState.value.currentPeriodIndex === null
                    || timerState.value.currentPeriodIndex === 0
                }
            >
                ⏮️
            </button>

            <button
                onClick={handleStartPause}
                disabled={timerHasFinished.value || !timerDurationRemaining.value}
            >
                {timerState.value.runningIntervalId
                    ? '⏸️️'
                    : timerState.value.timestampPaused
                      ? '▶️️ Resume'
                      : '▶️️ Start'}
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
                🔁 Reset
            </button>
            <button
                onClick={handleTimerCompletion}
                disabled={
                    timerHasFinished.value
                    || timerState.value.currentPeriodIndex === null
                    || timerDurationElapsed < 1 * 60 * 1000
                }
                class={
                    timerOnLastPeriod.value && timerState.value.shouldGoToNextPeriod
                        ? 'highlighted'
                        : ''
                }
            >
                🏁 Finish
            </button>

            <button
                onClick={moveToNextPeriod}
                disabled={
                    timerHasFinished.value
                    || timerState.value.currentPeriodIndex === null
                    || timerOnLastPeriod.value
                }
                class={
                    !timerOnLastPeriod.value && timerState.value.shouldGoToNextPeriod
                        ? 'highlighted'
                        : ''
                }
            >
                ⏭️
            </button>
        </section>
    )
}
