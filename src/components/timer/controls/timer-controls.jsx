import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
    faArrowRotateLeft,
    faPlay,
    faPause,
    faBackwardStep,
    faForwardStep,
    faFlagCheckered,
} from '@fortawesome/free-solid-svg-icons'
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
import { unlockAudio } from '../../../lib/sounds'
import { SoundWrapper } from '../../common/sound-wrapper'

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
                    <FontAwesomeIcon icon={faArrowRotateLeft} className="icon--danger" /> Reset
                </SoundWrapper>
                <SoundWrapper onClick={handleStartPause} disabled={!canStartPause.value}>
                    {timerState.value.runningIntervalId ? (
                        <FontAwesomeIcon icon={faPause} className="icon--warning" />
                    ) : timerState.value.timestampPaused ? (
                        <FontAwesomeIcon icon={faPlay} className="icon--success" />
                    ) : (
                        <>
                            <FontAwesomeIcon icon={faPlay} className="icon--success" /> Start
                        </>
                    )}
                </SoundWrapper>
                <div className="button-group">
                    <SoundWrapper
                        onClick={moveToPreviousPeriod}
                        disabled={!canMoveToPreviousPeriod.value}
                    >
                        <FontAwesomeIcon icon={faBackwardStep} className="icon--navigate" />
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
                        <FontAwesomeIcon icon={faForwardStep} className="icon--navigate" />
                    </SoundWrapper>
                </div>
                <SoundWrapper
                    onClick={handleTimerCompletion}
                    disabled={!canFinishTimer.value}
                    class={
                        timerOnLastPeriod.value && shouldGoToNextPeriod.value ? 'highlighted' : ''
                    }
                >
                    <FontAwesomeIcon icon={faFlagCheckered} className="icon--danger" /> Finish
                </SoundWrapper>
            </section>
        </>
    )
}
