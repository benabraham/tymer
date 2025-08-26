import {
    timerState,
    timerDurationElapsed,
    timerHasFinished,
    timerDurationRemaining,
    initialState,
    timerDuration,
    timerOnLastPeriod,
    shouldGoToNextPeriod,
    periodsModifiedFromInitial,
    handleTimerCompletion,
    pauseTimer,
    resumeTimer,
    startTimer,
    resetTimer,
    moveToNextPeriod,
    moveToPreviousPeriod,
} from '../../../lib/timer'
import { unlockAudio, handleButtonClick } from '../../../lib/sounds'

export const TimerControls = () => {
    const handleStartPause = async () => {
        // Unlock audio on first user interaction
        await unlockAudio()

        await handleButtonClick(() => {
            if (timerState.value.runningIntervalId) pauseTimer()
            else if (timerState.value.timestampPaused) resumeTimer()
            else startTimer()
        })
    }

    return (
        <>
            <section class="controls ">
                <button
                    onClick={() => handleButtonClick(resetTimer)}
                    disabled={
                        (!periodsModifiedFromInitial.value
                            && !timerState.value.timestampStarted
                            && timerDurationRemaining.value !== 0)
                        || (timerState.value.currentPeriodIndex === null
                            && !timerHasFinished.value
                            && !periodsModifiedFromInitial.value)
                    }
                    class={timerHasFinished.value ? 'highlighted' : ''}
                >
                    🔁 Reset
                </button>
                <button
                    onClick={handleStartPause}
                    disabled={timerHasFinished.value || !timerDurationRemaining.value}
                >
                    {timerState.value.runningIntervalId
                        ? '⏸️️'
                        : timerState.value.timestampPaused
                          ? '▶️️'
                          : '▶️️ Start'}
                </button>
                <button
                    onClick={() => handleButtonClick(handleTimerCompletion)}
                    disabled={
                        timerHasFinished.value
                        || timerState.value.currentPeriodIndex === null
                        || timerDurationElapsed < 1 * 60 * 1000
                    }
                    class={
                        timerOnLastPeriod.value && shouldGoToNextPeriod.value ? 'highlighted' : ''
                    }
                >
                    🏁 Finish
                </button>
            </section>
            <section class="controls">
                <div class="button-group">
                    <button
                        onClick={() => handleButtonClick(moveToPreviousPeriod)}
                        disabled={
                            timerHasFinished.value
                            || timerState.value.currentPeriodIndex === null
                            || timerState.value.currentPeriodIndex === 0
                        }
                    >
                        ⏮️
                    </button>

                    <button
                        onClick={() => handleButtonClick(moveToNextPeriod)}
                        disabled={
                            timerHasFinished.value
                            || timerState.value.currentPeriodIndex === null
                            || timerOnLastPeriod.value
                        }
                        class={
                            !timerOnLastPeriod.value && shouldGoToNextPeriod.value
                                ? 'highlighted'
                                : ''
                        }
                    >
                        ⏭️
                    </button>
                </div>
            </section>
        </>
    )
}
