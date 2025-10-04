import {
    timerState,
    timerOnLastPeriod,
    shouldGoToNextPeriod,
    timerHasFinished,
    canStartPause,
    canReset,
    canMoveToNextPeriod,
    canMoveToPreviousPeriod,
    canFinishTimer,
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
                    disabled={!canReset.value}
                    class={timerHasFinished.value ? 'highlighted' : ''}
                >
                    🔁 Reset
                </SoundWrapper>
                <SoundWrapper
                    onClick={handleStartPause}
                    disabled={!canStartPause.value}
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
                        disabled={!canMoveToPreviousPeriod.value}
                    >
                        ⏮️
                    </SoundWrapper>

                    <SoundWrapper
                        onClick={moveToNextPeriod}
                        disabled={!canMoveToNextPeriod.value}
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
                    disabled={!canFinishTimer.value}
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
