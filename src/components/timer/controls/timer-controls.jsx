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
import {unlockAudio} from '../../../lib/sounds'
import {SoundWrapper} from '../../common/sound-wrapper'

export const TimerControls = () => {
    const handleStartPause = async () => {
        // Unlock audio on first user interaction
        await unlockAudio()

        if (timerState.value.runningIntervalId) pauseTimer()
        else if (timerState.value.timestampPaused) resumeTimer()
        else startTimer()
    }

    return (
        <>
            <section class="controls">
                <SoundWrapper
                    onClick={resetTimer}
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
                </SoundWrapper>
                <SoundWrapper
                    onClick={handleStartPause}
                    disabled={timerHasFinished.value || !timerDurationRemaining.value}
                >
                    {timerState.value.runningIntervalId
                        ? '⏸️️'
                        : timerState.value.timestampPaused
                            ? '▶️️'
                            : '▶️️ Start'}
                </SoundWrapper>
                <div className="button-group">
                    <SoundWrapper
                        onClick={moveToPreviousPeriod}
                        disabled={
                            timerHasFinished.value
                            || timerState.value.currentPeriodIndex === null
                            || timerState.value.currentPeriodIndex === 0
                        }
                    >
                        ⏮️
                    </SoundWrapper>

                    <SoundWrapper
                        onClick={moveToNextPeriod}
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
                    </SoundWrapper>
                </div>
                <SoundWrapper
                    onClick={handleTimerCompletion}
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
                </SoundWrapper>
            </section>
        </>
    )
}
