import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
    faArrowRotateLeft,
    faPlay,
    faPause,
    faBackwardStep,
    faForwardStep,
    faFlagCheckered,
    faSliders,
} from '@fortawesome/free-solid-svg-icons'
import {
    timerOnLastPeriod,
    shouldGoToNextPeriod,
    timerHasFinished,
    canStartPause,
    canReset,
    canMoveToNextPeriod,
    canMoveToPreviousPeriod,
    canFinishTimer,
    canConfigureDurations,
    editingCurrentDurations,
    toggleDurationsPanel,
    handleTimerCompletion,
    pauseTimer,
    resumeTimer,
    startTimer,
    resetTimer,
    moveToNextPeriod,
    moveToPreviousPeriod,
} from '../../../lib/timer'
import { Schedule } from '../../../lib/schedule'
import { unlockAudio } from '../../../lib/sounds'
import { activeConfig, configPanelOpen } from '../../../lib/period-configs'
import { SoundWrapper } from '../../common/sound-wrapper'
import { ArmedIndicator } from './armed-indicator'

export const TimerControls = () => {
    const handleStartPause = async () => {
        // Unlock audio on first user interaction
        await unlockAudio()

        if (Schedule.isRunning.value) pauseTimer()
        else if (Schedule.isPaused.value) resumeTimer()
        else startTimer()
    }

    // Armed = idle + anchored. A future anchor auto-starts (lib effect handles
    // it); pressing Start re-pins to now ("Start now"). A past anchor starts
    // with the gap already elapsed on the first period — label stays plain.
    const isArmed = Schedule.isIdle.value && Schedule.isAnchored.value
    const isArmedFuture = isArmed && Schedule.timestampAnchor.value > Date.now()

    return (
        <>
            <section class="controls">
                <SoundWrapper
                    onClick={toggleDurationsPanel}
                    class={`config-toggle ${configPanelOpen.value ? 'config-toggle--open' : ''}`}
                >
                    <FontAwesomeIcon icon={faSliders} className="icon--navigate" />{' '}
                    {canConfigureDurations.value && !editingCurrentDurations.value
                        ? 'Durations config'
                        : 'Edit current durations'}
                </SoundWrapper>
                {isArmed && <ArmedIndicator />}
                <SoundWrapper
                    onClick={resetTimer}
                    disabled={!canReset.value}
                    class={timerHasFinished.value ? 'highlighted' : ''}
                >
                    <FontAwesomeIcon icon={faArrowRotateLeft} className="icon--danger" />{' '}
                    {activeConfig.value.readonly ? 'Reset' : `Reset to ${activeConfig.value.name}`}
                </SoundWrapper>
                <SoundWrapper
                    onClick={handleStartPause}
                    disabled={!canStartPause.value || configPanelOpen.value}
                >
                    {Schedule.isRunning.value ? (
                        <FontAwesomeIcon icon={faPause} className="icon--warning" />
                    ) : Schedule.isPaused.value ? (
                        <FontAwesomeIcon icon={faPlay} className="icon--success" />
                    ) : (
                        <>
                            <FontAwesomeIcon icon={faPlay} className="icon--success" />{' '}
                            {isArmedFuture ? 'Start now' : 'Start'}
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
