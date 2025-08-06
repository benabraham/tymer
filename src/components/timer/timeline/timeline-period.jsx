import {useState, useRef, useEffect, useCallback} from 'preact/hooks'
import {msToMinutes, formatTime} from '../../../lib/format'
import {
    updatePeriod,
    pauseTimer,
    resumeTimer,
    timerState,
    removePeriodByIndex,
    addPeriodAtIndex,
} from '../../../lib/timer'
import {TimelineCurrentTime} from './timeline-current-time'

export const TimelinePeriod = ({period, isActive, endTime, startTime, index}) => {
    const [isEditing, setIsEditing] = useState(false)
    const [wasTimerRunning, setWasTimerRunning] = useState(false)
    const [originalValues, setOriginalValues] = useState(null)
    const editRef = useRef()

    const availableTypes = ['work', 'break', 'fun']

    const handleClickOnPeriod = () => {
        // Check if timer is running and pause it
        const isTimerRunning = timerState.value.runningIntervalId !== null
        setWasTimerRunning(isTimerRunning)

        if (isTimerRunning) {
            pauseTimer()
        }

        // Store original values for potential cancellation
        setOriginalValues({
            type: period.type,
            note: period.note,
            periodDuration: period.periodDuration,
            periodUserIntendedDuration: period.periodUserIntendedDuration,
            periodDurationRemaining: period.periodDurationRemaining,
        })

        setIsEditing(true)
    }

    const handleSave = useCallback(() => {
        // Values are already in timer state, just exit edit mode
        setIsEditing(false)
        setOriginalValues(null)

        // Resume timer if it was running before edit
        if (wasTimerRunning) {
            resumeTimer()
        }
    }, [wasTimerRunning])

    const handleCancel = useCallback(() => {
        // Restore original values if we have them
        if (originalValues) {
            updatePeriod(index, originalValues)
        }

        setIsEditing(false)
        setOriginalValues(null)

        // Resume timer if it was running before edit
        if (wasTimerRunning) {
            resumeTimer()
        }
    }, [originalValues, index, wasTimerRunning])

    // Update timer state immediately when values change
    const handleTypeChange = newType => {
        updatePeriod(index, {type: newType})
    }

    const handleDurationChange = newDuration => {
        const durationMs = newDuration * 60 * 1000

        // For active periods, preserve elapsed time and update remaining time accordingly
        const updatedProps = {
            periodDuration: durationMs,
            periodUserIntendedDuration: durationMs,
        }

        // Calculate new remaining time based on current elapsed time
        if (isActive) {
            updatedProps.periodDurationRemaining = Math.max(
                0,
                durationMs - period.periodDurationElapsed,
            )
        } else {
            // For finished periods, set elapsed time to match new duration and remaining to 0
            if (period.periodHasFinished || period.periodDurationRemaining === 0) {
                updatedProps.periodDurationElapsed = durationMs
                updatedProps.periodDurationRemaining = 0
            } else {
                // For unstarted periods, reset remaining time to match new duration
                updatedProps.periodDurationRemaining = durationMs
            }
        }

        updatePeriod(index, updatedProps)
    }

    const handleNoteChange = newNote => {
        updatePeriod(index, {note: newNote})
    }

    const handleDelete = () => {
        // Don't allow deleting the active period if it's the only one
        if (isActive && timerState.value.periods.length === 1) {
            return
        }

        removePeriodByIndex(index)
        setIsEditing(false)

        // Resume timer if it was running before edit
        if (wasTimerRunning) {
            resumeTimer()
        }
    }

    const handleAddPeriod = () => {
        addPeriodAtIndex(index)
    }

    // Handle click outside to save
    useEffect(() => {
        if (!isEditing) return

        const handleClickOutside = event => {
            if (editRef.current && !editRef.current.contains(event.target)) {
                handleSave()
            }
        }

        const handleKeyDown = event => {
            if (event.key === 'Escape') {
                handleCancel()
            } else if (event.key === 'Enter') {
                handleSave()
            }
        }

        document.addEventListener('mousedown', handleClickOutside)
        document.addEventListener('keydown', handleKeyDown)

        return () => {
            document.removeEventListener('mousedown', handleClickOutside)
            document.removeEventListener('keydown', handleKeyDown)
        }
    }, [isEditing, handleSave, handleCancel])

    if (isEditing) {
        return (
            <div
                ref={editRef}
                class={`
                    timeline__period
                    timeline__period--${period.type}
                    timeline__period--editing
                `}
                style={`--period-minutes: ${Math.round(period.periodDuration / (60 * 1000))};`}
            >
                <div class="timeline__text timeline__edit-form">
                    <div class="timeline__edit-row">
                        <div class="timeline__edit-type-group">
                            {availableTypes.map(type => (
                                <button
                                    key={type}
                                    type="button"
                                    className={`timeline__edit-type-button ${period.type === type ? 'timeline__edit-type-button--active' : ''}`}
                                    onClick={() => handleTypeChange(type)}
                                >
                                    {type}
                                </button>
                            ))}
                        </div>
                        <input
                            type="number"
                            value={Math.round(period.periodDuration / (60 * 1000))}
                            onChange={e => handleDurationChange(parseInt(e.target.value) || 1)}
                            className="timeline__edit-duration"
                            min="1"
                            max="999"
                        />

                    </div>
                    <div class="timeline__edit-row">
                        <input
                            type="text"
                            value={period.note || ''}
                            onChange={e => handleNoteChange(e.target.value)}
                            placeholder="Note…"
                            class="timeline__edit-note"
                        />
                        <button
                            onClick={handleDelete}
                            className="timeline__edit-delete"
                            title="Delete period"
                            disabled={isActive && timerState.value.periods.length === 1}
                        >
                            🗑️
                        </button>

                    </div>
                </div>
            </div>
        )
    }

    return (
        <div
            class={`
                    timeline__period
                    timeline__period--${period.type}
                    ${isActive ? 'timeline__period--active' : ''}
                    timeline__period--editable
                `}
            style={`--period-minutes: ${msToMinutes(period.periodDuration)};--userintended-minutes: ${msToMinutes(period.periodUserIntendedDuration)};`}
            onClick={handleClickOnPeriod}
        >
            <div class="timeline__text">
                <div class="timeline__type">
                    {period.type}
                    {period.note && <div class="timeline__note">{period.note}</div>}
                </div>
                <div class="timeline__period-duration">{formatTime(period.periodDuration)}</div>

                {index === 0 && startTime && <div class="timeline__start-time">{startTime}</div>}
                <div class="timeline__end-time">{endTime}</div>
            </div>

            <div
                class="timeline__elapsed-time"
                style={`--elapsed-minutes: ${msToMinutes(period.periodDurationElapsed)};`}
            >
                {isActive && <TimelineCurrentTime period={period}/>}
            </div>
            {isActive && <div class="timeline__subinterval"></div>}
            {isActive && period.periodDurationElapsed > period.periodUserIntendedDuration && (
                <div class="timeline__userintended"></div>
            )}

            <button
                className="button timeline__add-period"
                onClick={handleAddPeriod}
                title="Add period after this one"
            >
                ➕
            </button>
        </div>
    )
}
