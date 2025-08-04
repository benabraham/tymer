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

    const handleDoubleClick = () => {
        if (isActive) return // Don't allow editing active periods

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
        updatePeriod(index, {
            periodDuration: durationMs,
            periodUserIntendedDuration: durationMs,
            periodDurationRemaining: durationMs - period.periodDurationElapsed,
        })
    }

    const handleNoteChange = newNote => {
        updatePeriod(index, {note: newNote})
    }

    const handleDelete = () => {
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
                        <select
                            value={period.type}
                            onChange={e => handleTypeChange(e.target.value)}
                            class="timeline__edit-type"
                        >
                            {availableTypes.map(type => (
                                <option key={type} value={type}>
                                    {type}
                                </option>
                            ))}
                        </select>
                        <input
                            type="number"
                            value={Math.round(period.periodDuration / (60 * 1000))}
                            onChange={e => handleDurationChange(parseInt(e.target.value) || 1)}
                            class="timeline__edit-duration"
                            min="1"
                            max="999"
                        />
                        <button
                            onClick={handleDelete}
                            class="timeline__edit-delete"
                            title="Delete period"
                        >
                            🗑️
                        </button>
                    </div>
                    <div class="timeline__edit-row">
                        <input
                            type="text"
                            value={period.note || ''}
                            onChange={e => handleNoteChange(e.target.value)}
                            placeholder="Note…"
                            class="timeline__edit-note"
                        />
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
                    ${!isActive ? 'timeline__period--editable' : ''}
                `}
            style={`--period-minutes: ${msToMinutes(period.periodDuration)};`}
            onDblClick={handleDoubleClick}
        >
            <div class="timeline__text">
                <div class="timeline__type">
                    {period.type}
                    {period.note && <div class="timeline__note">{period.note}</div>}
                </div>
                <div class="timeline__period-duration">{formatTime(period.periodDuration)}</div>

                {index === 0 && startTime && (
                    <div class="timeline__start-time">{startTime}</div>
                )}
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
