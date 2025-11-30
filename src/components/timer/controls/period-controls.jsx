import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
    faMinus,
    faPlus,
    faChevronLeft,
    faChevronRight,
    faAnglesLeft,
    faAnglesRight,
    faRotateLeft,
    faCirclePlus,
    faCircleMinus,
    faRepeat,
} from '@fortawesome/free-solid-svg-icons'
import {
    adjustDuration,
    adjustElapsed,
    timerDurationElapsed,
    moveElapsedTimeToPreviousPeriod,
    changeType,
    addPeriod,
    removePeriod,
    canAdjustElapsed,
    canAdjustDuration,
    canAdjustElapsedForward,
    canAdjustElapsedBackward,
    canAdjustDurationForward,
    canChangeType,
    canAddPeriod,
    canRemovePeriod,
    canMoveElapsedToPrevious,
} from '../../../lib/timer'
import { SoundWrapper } from '../../common/sound-wrapper'

export const PeriodControls = () => (
    <section className="controls">
        <div class="button-group">
            <SoundWrapper
                onClick={moveElapsedTimeToPreviousPeriod}
                disabled={!canMoveElapsedToPrevious.value}
            >
                move time to previous
            </SoundWrapper>
        </div>

        <div class="button-group">
            <SoundWrapper
                onClick={() => adjustElapsed(-timerDurationElapsed.value)}
                disabled={!canAdjustElapsedBackward.value}
            >
                <FontAwesomeIcon icon={faRotateLeft} className="icon--danger" />
            </SoundWrapper>
            <SoundWrapper
                onClick={() => adjustElapsed(-6 * 60 * 1000)}
                disabled={!canAdjustElapsed(-6 * 60 * 1000)}
            >
                <FontAwesomeIcon icon={faAnglesLeft} className="icon--navigate" /> 6m
            </SoundWrapper>
            <SoundWrapper
                onClick={() => adjustElapsed(-1 * 60 * 1000)}
                disabled={!canAdjustElapsed(-1 * 60 * 1000)}
            >
                <FontAwesomeIcon icon={faChevronLeft} className="icon--navigate" /> 1m
            </SoundWrapper>
            <SoundWrapper
                onClick={() => adjustElapsed(1 * 60 * 1000)}
                disabled={!canAdjustElapsedForward.value}
            >
                1m <FontAwesomeIcon icon={faChevronRight} className="icon--navigate" />
            </SoundWrapper>
            <SoundWrapper
                onClick={() => adjustElapsed(6 * 60 * 1000)}
                disabled={!canAdjustElapsedForward.value}
            >
                6m <FontAwesomeIcon icon={faAnglesRight} className="icon--navigate" />
            </SoundWrapper>
        </div>

        <div class="button-group">
            <SoundWrapper
                onClick={() => adjustDuration(-6 * 60 * 1000)}
                disabled={!canAdjustDuration(-6 * 60 * 1000)}
            >
                <FontAwesomeIcon icon={faMinus} className="icon--danger" /> 6 min
            </SoundWrapper>
            <SoundWrapper
                onClick={() => adjustDuration(-1 * 60 * 1000)}
                disabled={!canAdjustDuration(-1 * 60 * 1000)}
            >
                <FontAwesomeIcon icon={faMinus} className="icon--danger" /> 1 min
            </SoundWrapper>
            <SoundWrapper
                onClick={() => adjustDuration(1 * 60 * 1000)}
                disabled={!canAdjustDurationForward.value}
            >
                <FontAwesomeIcon icon={faPlus} className="icon--success" /> 1 min
            </SoundWrapper>
            <SoundWrapper
                onClick={() => adjustDuration(6 * 60 * 1000)}
                disabled={!canAdjustDurationForward.value}
            >
                <FontAwesomeIcon icon={faPlus} className="icon--success" /> 6 min
            </SoundWrapper>
        </div>

        <SoundWrapper onClick={changeType} disabled={!canChangeType.value}>
            <FontAwesomeIcon icon={faRepeat} className="icon--special" /> change type
        </SoundWrapper>

        <div class="button-group">
            <SoundWrapper onClick={addPeriod} disabled={!canAddPeriod.value}>
                <FontAwesomeIcon icon={faCirclePlus} className="icon--success" /> add period
            </SoundWrapper>
            <SoundWrapper onClick={removePeriod} disabled={!canRemovePeriod.value}>
                <FontAwesomeIcon icon={faCircleMinus} className="icon--danger" /> remove period
            </SoundWrapper>
        </div>
    </section>
)
