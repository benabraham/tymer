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
import { ActionButton } from '../../common/action-button'

export const PeriodControls = () => (
    <section className="controls">
        <div class="button-group">
            <ActionButton
                onClick={moveElapsedTimeToPreviousPeriod}
                disabled={!canMoveElapsedToPrevious.value}
            >
                move time to previous
            </ActionButton>
        </div>

        <div class="button-group">
            <ActionButton
                onClick={() => adjustElapsed(-timerDurationElapsed.value)}
                disabled={!canAdjustElapsedBackward.value}
            >
                <FontAwesomeIcon icon={faRotateLeft} className="icon--danger" />
            </ActionButton>
            <ActionButton
                onClick={() => adjustElapsed(-6 * 60 * 1000)}
                disabled={!canAdjustElapsed(-6 * 60 * 1000)}
            >
                <FontAwesomeIcon icon={faAnglesLeft} className="icon--navigate" /> 6m
            </ActionButton>
            <ActionButton
                onClick={() => adjustElapsed(-1 * 60 * 1000)}
                disabled={!canAdjustElapsed(-1 * 60 * 1000)}
            >
                <FontAwesomeIcon icon={faChevronLeft} className="icon--navigate" /> 1m
            </ActionButton>
            <ActionButton
                onClick={() => adjustElapsed(1 * 60 * 1000)}
                disabled={!canAdjustElapsedForward.value}
            >
                1m <FontAwesomeIcon icon={faChevronRight} className="icon--navigate" />
            </ActionButton>
            <ActionButton
                onClick={() => adjustElapsed(6 * 60 * 1000)}
                disabled={!canAdjustElapsedForward.value}
            >
                6m <FontAwesomeIcon icon={faAnglesRight} className="icon--navigate" />
            </ActionButton>
        </div>

        <div class="button-group">
            <ActionButton
                onClick={() => adjustDuration(-6 * 60 * 1000)}
                disabled={!canAdjustDuration(-6 * 60 * 1000)}
            >
                <FontAwesomeIcon icon={faMinus} className="icon--danger" /> 6 min
            </ActionButton>
            <ActionButton
                onClick={() => adjustDuration(-1 * 60 * 1000)}
                disabled={!canAdjustDuration(-1 * 60 * 1000)}
            >
                <FontAwesomeIcon icon={faMinus} className="icon--danger" /> 1 min
            </ActionButton>
            <ActionButton
                onClick={() => adjustDuration(1 * 60 * 1000)}
                disabled={!canAdjustDurationForward.value}
            >
                <FontAwesomeIcon icon={faPlus} className="icon--success" /> 1 min
            </ActionButton>
            <ActionButton
                onClick={() => adjustDuration(6 * 60 * 1000)}
                disabled={!canAdjustDurationForward.value}
            >
                <FontAwesomeIcon icon={faPlus} className="icon--success" /> 6 min
            </ActionButton>
        </div>

        <ActionButton onClick={changeType} disabled={!canChangeType.value}>
            <FontAwesomeIcon icon={faRepeat} className="icon--special" /> change type
        </ActionButton>

        <div class="button-group">
            <ActionButton onClick={addPeriod} disabled={!canAddPeriod.value}>
                <FontAwesomeIcon icon={faCirclePlus} className="icon--success" /> add period
            </ActionButton>
            <ActionButton onClick={removePeriod} disabled={!canRemovePeriod.value}>
                <FontAwesomeIcon icon={faCircleMinus} className="icon--danger" /> remove period
            </ActionButton>
        </div>
    </section>
)
