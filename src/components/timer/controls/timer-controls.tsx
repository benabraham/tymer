import {
    faArrowRotateLeft,
    faBackwardStep,
    faFlagCheckered,
    faForwardStep,
    faPause,
    faPlay,
    faSliders,
} from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { activeConfig, configPanelOpen } from '../../../lib/period-configs'
import { Schedule } from '../../../lib/schedule'
import { unlockAudio } from '../../../lib/sounds'
import {
    canConfigureDurations,
    canFinishTimer,
    canMoveToNextPeriod,
    canMoveToPreviousPeriod,
    canReset,
    canStartPause,
    editingCurrentDurations,
    handleTimerCompletion,
    moveToNextPeriod,
    moveToPreviousPeriod,
    pauseTimer,
    resetTimer,
    resumeTimer,
    shouldGoToNextPeriod,
    startTimer,
    timerHasFinished,
    timerOnLastPeriod,
    toggleDurationsPanel,
} from '../../../lib/timer'
import { ActionButton } from '../../common/action-button'
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
    // isArmed already implies isAnchored (timestampAnchor non-null); the
    // fallback is unreachable at runtime and only satisfies the type checker.
    const isArmedFuture = isArmed && (Schedule.timestampAnchor.value ?? 0) > Date.now()

    return (
        <>
            <section class="controls">
                <ActionButton
                    onClick={toggleDurationsPanel}
                    class={`config-toggle ${configPanelOpen.value ? 'config-toggle--open' : ''}`}
                >
                    <FontAwesomeIcon icon={faSliders} className="icon--navigate" />{' '}
                    {canConfigureDurations.value && !editingCurrentDurations.value
                        ? 'Durations config'
                        : 'Edit current durations'}
                </ActionButton>
                {isArmed && <ArmedIndicator />}
                <ActionButton
                    onClick={resetTimer}
                    disabled={!canReset.value}
                    class={timerHasFinished.value ? 'highlighted' : ''}
                >
                    <FontAwesomeIcon icon={faArrowRotateLeft} className="icon--danger" />{' '}
                    {activeConfig.value.readonly ? 'Reset' : `Reset to ${activeConfig.value.name}`}
                </ActionButton>
                <ActionButton
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
                </ActionButton>
                <div className="button-group">
                    <ActionButton
                        onClick={moveToPreviousPeriod}
                        disabled={!canMoveToPreviousPeriod.value}
                    >
                        <FontAwesomeIcon icon={faBackwardStep} className="icon--navigate" />
                    </ActionButton>

                    <ActionButton
                        onClick={moveToNextPeriod}
                        disabled={!canMoveToNextPeriod.value}
                        class={
                            !timerOnLastPeriod.value && shouldGoToNextPeriod.value
                                ? 'highlighted'
                                : ''
                        }
                    >
                        <FontAwesomeIcon icon={faForwardStep} className="icon--navigate" />
                    </ActionButton>
                </div>
                <ActionButton
                    onClick={handleTimerCompletion}
                    disabled={!canFinishTimer.value}
                    class={
                        timerOnLastPeriod.value && shouldGoToNextPeriod.value ? 'highlighted' : ''
                    }
                >
                    <FontAwesomeIcon icon={faFlagCheckered} className="icon--danger" /> Finish
                </ActionButton>
            </section>
        </>
    )
}
