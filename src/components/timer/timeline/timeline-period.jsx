import {useState, useRef, useEffect, useCallback} from 'preact/hooks'
import {msToMinutes, formatTime} from '../../../lib/format'
import {
    updatePeriod,
    pauseTimer,
    resumeTimer,
    timerState,
    removePeriodByIndex,
    addPeriodAtIndex,
    autoEditIndex,
} from '../../../lib/timer'
import {TimelineCurrentTime} from './timeline-current-time'
import {SoundWrapper} from '../../common/sound-wrapper'
import {playSound} from '../../../lib/sounds'

export const TimelinePeriod = ({period, isActive, endTime, startTime, index}) => {
    const [isEditing, setIsEditing] = useState(false)
    const [wasTimerRunning, setWasTimerRunning] = useState(false)
    const [originalValues, setOriginalValues] = useState(null)
    const editRef = useRef()
    const noteInputRef = useRef()

    // Focus/blur note input when editing state changes
    useEffect(() => {
        if (isEditing && noteInputRef.current) {
            noteInputRef.current.focus()
        } else if (!isEditing && noteInputRef.current) {
            noteInputRef.current.blur()
        }
    }, [isEditing])

    const availableTypes = ['work', 'break', 'fun']

    const handleClickOnPeriod = async () => {
        await playSound('button')

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

    const handleAddPeriod = event => {
        event.stopPropagation()
        addPeriodAtIndex(index)
        // The new period at index + 1 will automatically open for editing
        // via the autoEditIndex signal set in addPeriodAtIndex
    }

    // Auto-open editing when this period is flagged for auto-edit
    useEffect(() => {
        if (autoEditIndex.value === index) {
            autoEditIndex.value = null // Clear the signal
            handleClickOnPeriod() // Open edit mode
        }
    }, [autoEditIndex.value, index])

    // Handle click outside to save
    useEffect(() => {
        if (!isEditing) return

        const handleClickOutside = async event => {
            if (editRef.current && !editRef.current.contains(event.target)) {
                await playSound('button')
                handleSave()
            }
        }

        const handleKeyDown = async event => {
            if (event.key === 'Escape') {
                await playSound('button')
                handleCancel()
            } else if (event.key === 'Enter') {
                await playSound('button')
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
                    <div className="timeline__edit-row">
                        <section className="controls mb-0">
                            <div className="button-group button-group--tight button-group--connected">
                                {(() => {
                                    const totalMinutes = Math.round(period.periodDuration / (60 * 1000))
                                    const currentHours = Math.floor(totalMinutes / 60)
                                    const currentMinutes = totalMinutes % 60
                                    const elapsedMinutes = Math.round(period.periodDurationElapsed / (60 * 1000))

                                    return [0, 1, 2, 3, 4].map(hours => (
                                        <button
                                            key={hours}
                                            tabIndex={1}
                                            className={`button-group-item ${currentHours === hours ? 'button-group-item--active' : ''}`}
                                            onClick={() => handleDurationChange((hours * 60) + currentMinutes)}
                                            disabled={isActive && ((hours * 60) + currentMinutes) < elapsedMinutes}
                                        >
                                            {hours}
                                        </button>
                                    ))
                                })()}
                            </div>
                        </section>
                        <input
                            type="number"
                            tabIndex={4}
                            value={Math.round(period.periodDuration / (60 * 1000))}
                            onChange={e => handleDurationChange(parseInt(e.target.value) || Math.max(1, Math.round(period.periodDurationElapsed / (60 * 1000))))}
                            className="timeline__edit-duration"
                            min={isActive ? Math.round(period.periodDurationElapsed / (60 * 1000)) : 1}
                            max="900"
                        />
                        <section className="controls mb-0">
                            <div className="button-group button-group--tight button-group--connected">
                                {(() => {
                                    const totalMinutes = Math.round(period.periodDuration / (60 * 1000))
                                    const currentHours = Math.floor(totalMinutes / 60)
                                    const currentMinutes = totalMinutes % 60
                                    const elapsedMinutes = Math.round(period.periodDurationElapsed / (60 * 1000))

                                    return [0, 3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36, 39, 42, 45, 48, 51, 54, 57].map(minutes => {
                                        const minuteButtonValues = [0, 3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36, 39, 42, 45, 48, 51, 54, 57]
                                        const currentIndex = minuteButtonValues.findIndex(val => val === currentMinutes)

                                        const isActive = currentMinutes === minutes
                                        let isSemiActive = false

                                        if (!isActive && currentIndex === -1) {
                                            // Find the closest lower and higher values
                                            const lowerIndex = minuteButtonValues.findLastIndex(val => val < currentMinutes)
                                            const higherIndex = minuteButtonValues.findIndex(val => val > currentMinutes)

                                            isSemiActive = (
                                                (lowerIndex !== -1 && minutes === minuteButtonValues[lowerIndex]) ||
                                                (higherIndex !== -1 && minutes === minuteButtonValues[higherIndex])
                                            )
                                        }

                                        return (
                                            <button
                                                key={minutes}
                                                tabIndex={2}
                                                className={`button-group-item ${minutes % 12 === 0 ? 'fw-900' : minutes % 6 === 0 ? 'button--sm' : 'button--xs'} ${isActive ? 'button-group-item--active' : isSemiActive ? 'button-group-item--semiactive' : ''}`}
                                                onClick={() => handleDurationChange((currentHours * 60) + minutes)}
                                                disabled={isActive && ((currentHours * 60) + minutes) < elapsedMinutes}
                                            >
                                                {minutes}
                                            </button>
                                        )
                                    })
                                })()}
                            </div>
                        </section>

                    </div>
                    <div class="timeline__edit-row">

                        <div class="button-group button-group--connected">
                            {availableTypes.map(type => (
                                <SoundWrapper
                                    key={type}
                                    type="button"
                                    tabIndex={3}
                                    class={`button-group-item ${period.type === type ? 'button-group-item--active' : ''}`}
                                    onClick={() => handleTypeChange(type)}
                                >
                                    {type}
                                </SoundWrapper>
                            ))}
                        </div>
                        <input
                            ref={noteInputRef}
                            type="text"
                            tabIndex={5}
                            value={period.note || ''}
                            onChange={e => handleNoteChange(e.target.value)}
                            placeholder="Note…"
                            class="timeline__edit-note"
                        />
                        <SoundWrapper
                            onClick={handleDelete}
                            tabIndex={6}
                            class="timeline__edit-delete"
                            title="Delete period"
                            disabled={isActive && timerState.value.periods.length === 1}
                        >
                            🗑️
                        </SoundWrapper>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <SoundWrapper
            as="div"
            class={`
                    timeline__period
                    timeline__period--${period.type}
                    ${isActive ? 'timeline__period--active' : ''}
                    timeline__period--editable
                `}
            style={`--period-minutes: ${msToMinutes(period.periodDuration)};--userintended-minutes: ${msToMinutes(period.periodUserIntendedDuration)};`}
            onClick={handleClickOnPeriod}
        >
            <div className="timeline__text">
                <div className="timeline__period-duration">{formatTime(period.periodDuration, { compact: true })}</div>
                {period.note && <div className="timeline__note">{period.note}</div>}

                {index === 0 && startTime && <div className="timeline__start-time" dangerouslySetInnerHTML={{ __html: startTime }} />}
                <div className="timeline__end-time" dangerouslySetInnerHTML={{ __html: endTime }} />
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

            <SoundWrapper
                class="button timeline__add-period"
                onClick={handleAddPeriod}
                title="Add period after this one"
            >
                ➕
            </SoundWrapper>
        </SoundWrapper>
    )
}
