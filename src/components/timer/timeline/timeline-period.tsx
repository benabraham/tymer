import { faCircleMinus, faPlus, faThumbtack } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import type { JSX } from 'preact'
import { useCallback, useEffect, useRef, useState } from 'preact/hooks'
import { clocksVisible } from '../../../lib/clocks'
import { formatTime, msToMinutes } from '../../../lib/format'
import { Period } from '../../../lib/period'
import type { PeriodData, PeriodType } from '../../../lib/period.js'
import { Schedule } from '../../../lib/schedule'
import { playSound } from '../../../lib/sounds'
import {
    addPeriodAtIndex,
    applyToPeriod,
    autoEditIndex,
    canTogglePin,
    pauseForEditing,
    removePeriodByIndex,
    resumeAfterEditing,
    timerState,
    togglePinTimer,
} from '../../../lib/timer'
import { ActionButton } from '../../common/action-button'
import { TimelineCurrentTime } from './timeline-current-time'
import type { TimelinePeriodProps } from './timeline-logic'

export const TimelinePeriod = ({
    period,
    isActive,
    endTime,
    startTime,
    index,
}: TimelinePeriodProps) => {
    const [isEditing, setIsEditing] = useState(false)
    const [wasTimerRunning, setWasTimerRunning] = useState(false)
    const [originalPeriod, setOriginalPeriod] = useState<PeriodData | null>(null)
    const editRef = useRef<HTMLDivElement>(null)
    const noteInputRef = useRef<HTMLInputElement>(null)

    // Focus/blur note input when editing state changes
    useEffect(() => {
        if (isEditing && noteInputRef.current) {
            noteInputRef.current.focus()
        } else if (!isEditing && noteInputRef.current) {
            noteInputRef.current.blur()
        }
    }, [isEditing])

    const availableTypes: PeriodType[] = ['work', 'break', 'fun']

    const handleClickOnPeriod = async () => {
        await playSound('button')

        // Check if timer is running and pause it
        const isTimerRunning = Schedule.isRunning.value
        setWasTimerRunning(isTimerRunning)

        if (isTimerRunning) {
            pauseForEditing()
        }

        // Store original period for potential cancellation
        setOriginalPeriod(period)

        setIsEditing(true)
    }

    const handleSave = useCallback(() => {
        // Values are already in timer state, just exit edit mode
        setIsEditing(false)
        setOriginalPeriod(null)

        // Resume timer if it was running before edit
        if (wasTimerRunning) {
            resumeAfterEditing()
        }
    }, [wasTimerRunning])

    const handleCancel = useCallback(() => {
        // Restore original period if we have it
        if (originalPeriod) {
            applyToPeriod(index, () => originalPeriod)
        }

        setIsEditing(false)
        setOriginalPeriod(null)

        // Resume timer if it was running before edit
        if (wasTimerRunning) {
            resumeAfterEditing()
        }
    }, [originalPeriod, index, wasTimerRunning])

    // Update timer state immediately when values change
    const handleTypeChange = (newType: PeriodType) => {
        applyToPeriod(index, p => Period.setType(p, newType))
    }

    const handleDurationChange = (newDuration: number) => {
        const durationMs = newDuration * 60 * 1000
        const currentPeriodIndex = Schedule.currentPeriodIndex.value
        const isPast = currentPeriodIndex !== null && index < currentPeriodIndex
        applyToPeriod(index, p =>
            isPast
                ? Period.amendRecordedDuration(p, durationMs)
                : Period.setPlannedDuration(p, durationMs),
        )
    }

    const handleNoteChange = (newNote: string) => {
        applyToPeriod(index, p => Period.setNote(p, newNote))
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
            resumeAfterEditing()
        }
    }

    const handleAddPeriod = (event: JSX.TargetedMouseEvent<HTMLElement>) => {
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

        const handleClickOutside = async (event: MouseEvent) => {
            if (editRef.current && !editRef.current.contains(event.target as Node)) {
                await playSound('button')
                handleSave()
            }
        }

        const handleKeyDown = async (event: KeyboardEvent) => {
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
                    timeline__period--${period.config.type}
                    timeline__period--editing
                `}
                style={`--period-minutes: ${Math.round(period.state.duration / (60 * 1000))};`}
            >
                <div class="timeline__text timeline__edit-form">
                    <div className="timeline__edit-row">
                        <section className="controls controls--tighter">
                            <div className="button-group button-group--tight button-group--connected">
                                {(() => {
                                    const totalMinutes = Math.round(
                                        period.state.duration / (60 * 1000),
                                    )
                                    const currentHours = Math.floor(totalMinutes / 60)
                                    const currentMinutes = totalMinutes % 60
                                    const elapsedMinutes = Math.round(
                                        period.state.elapsed / (60 * 1000),
                                    )

                                    return [0, 1, 2, 3, 4].map(hours => {
                                        const resultMinutes = hours * 60 + currentMinutes
                                        return (
                                            <button
                                                key={hours}
                                                tabIndex={1}
                                                className={`button-group-item ${currentHours === hours ? 'button-group-item--active' : ''}`}
                                                onClick={() => handleDurationChange(resultMinutes)}
                                                disabled={
                                                    resultMinutes < 1
                                                    || (isActive && resultMinutes < elapsedMinutes)
                                                }
                                            >
                                                {hours}
                                            </button>
                                        )
                                    })
                                })()}
                            </div>
                        </section>
                        <input
                            type="number"
                            tabIndex={4}
                            value={Math.round(period.state.duration / (60 * 1000))}
                            onChange={(e: JSX.TargetedEvent<HTMLInputElement>) =>
                                handleDurationChange(
                                    parseInt(e.currentTarget.value)
                                        || Math.max(
                                            1,
                                            Math.round(period.state.elapsed / (60 * 1000)),
                                        ),
                                )
                            }
                            className="timeline__edit-duration"
                            min={isActive ? Math.round(period.state.elapsed / (60 * 1000)) : 1}
                            max="900"
                        />
                        <section className="controls controls--tighter">
                            <div className="button-group button-group--tight button-group--connected">
                                {(() => {
                                    const totalMinutes = Math.round(
                                        period.state.duration / (60 * 1000),
                                    )
                                    const currentHours = Math.floor(totalMinutes / 60)
                                    const currentMinutes = totalMinutes % 60
                                    const elapsedMinutes = Math.round(
                                        period.state.elapsed / (60 * 1000),
                                    )

                                    return [
                                        0, 3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36, 39, 42, 45,
                                        48, 51, 54, 57,
                                    ].map(minutes => {
                                        const minuteButtonValues = [
                                            0, 3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36, 39, 42,
                                            45, 48, 51, 54, 57,
                                        ]
                                        const currentIndex = minuteButtonValues.findIndex(
                                            val => val === currentMinutes,
                                        )

                                        const isActive = currentMinutes === minutes
                                        let isSemiActive = false

                                        if (!isActive && currentIndex === -1) {
                                            // Find the closest lower and higher values
                                            const lowerIndex = minuteButtonValues.findLastIndex(
                                                val => val < currentMinutes,
                                            )
                                            const higherIndex = minuteButtonValues.findIndex(
                                                val => val > currentMinutes,
                                            )

                                            isSemiActive =
                                                (lowerIndex !== -1
                                                    && minutes === minuteButtonValues[lowerIndex])
                                                || (higherIndex !== -1
                                                    && minutes === minuteButtonValues[higherIndex])
                                        }

                                        const resultMinutes = currentHours * 60 + minutes
                                        return (
                                            <button
                                                key={minutes}
                                                tabIndex={2}
                                                className={`button-group-item ${minutes % 12 === 0 ? 'fw-900' : minutes % 6 === 0 ? 'button--sm' : 'button--xs'} ${isActive ? 'button-group-item--active' : isSemiActive ? 'button-group-item--semiactive' : ''}`}
                                                onClick={() => handleDurationChange(resultMinutes)}
                                                disabled={
                                                    resultMinutes < 1
                                                    || (isActive && resultMinutes < elapsedMinutes)
                                                }
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
                                <ActionButton
                                    key={type}
                                    type="button"
                                    tabIndex={3}
                                    class={`button-group-item ${period.config.type === type ? 'button-group-item--active' : ''}`}
                                    onClick={() => handleTypeChange(type)}
                                >
                                    {type}
                                </ActionButton>
                            ))}
                        </div>
                        <input
                            ref={noteInputRef}
                            type="text"
                            tabIndex={5}
                            value={period.config.note || ''}
                            onChange={(e: JSX.TargetedEvent<HTMLInputElement>) =>
                                handleNoteChange(e.currentTarget.value)
                            }
                            placeholder="Note…"
                            class="timeline__edit-note"
                        />
                        <div class="button-group">
                            <ActionButton
                                onClick={handleDelete}
                                tabIndex={6}
                                title="Delete period"
                                disabled={isActive && timerState.value.periods.length === 1}
                            >
                                <FontAwesomeIcon icon={faCircleMinus} className="icon--danger" />
                            </ActionButton>
                        </div>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <ActionButton
            as="div"
            class={`
                    timeline__period
                    timeline__period--${period.config.type}
                    ${isActive ? 'timeline__period--active' : ''}
                    timeline__period--editable
                `}
            style={`--period-minutes: ${msToMinutes(period.state.duration)};--userintended-minutes: ${msToMinutes(period.config.userIntendedDuration)};`}
            onClick={handleClickOnPeriod}
        >
            <div className="timeline__text">
                <div className="timeline__period-duration">
                    {formatTime(period.state.duration, { compact: true })}
                </div>
                {period.config.note && <div className="timeline__note">{period.config.note}</div>}

                {clocksVisible.value && index === 0 && startTime && (
                    <div
                        className={`timeline__start-time ${Schedule.isAnchored.value ? 'timeline__start-time--pinned' : ''}`}
                        title={
                            Schedule.isAnchored.value
                                ? 'Unpin start time (P)'
                                : 'Pin start time (P)'
                        }
                        onClick={event => {
                            event.stopPropagation()
                            if (!canTogglePin.value) return
                            togglePinTimer()
                        }}
                    >
                        <span dangerouslySetInnerHTML={{ __html: startTime }} />
                        {Schedule.isAnchored.value && (
                            <FontAwesomeIcon icon={faThumbtack} className="timeline__pin-icon" />
                        )}
                    </div>
                )}
                {clocksVisible.value && (
                    <div
                        className="timeline__end-time"
                        dangerouslySetInnerHTML={{ __html: endTime }}
                    />
                )}
            </div>

            <div
                class="timeline__elapsed-time"
                style={`--elapsed-minutes: ${msToMinutes(period.state.elapsed)};`}
            >
                {isActive && <TimelineCurrentTime period={period} />}
            </div>
            {isActive && <div class="timeline__subinterval"></div>}
            {isActive && period.state.elapsed > period.config.userIntendedDuration && (
                <div class="timeline__userintended"></div>
            )}

            <ActionButton
                class="button timeline__add-period"
                onClick={handleAddPeriod}
                title="Add period after this one"
                tabIndex={-1}
            >
                <FontAwesomeIcon icon={faPlus} className="icon--success" />
            </ActionButton>
        </ActionButton>
    )
}
