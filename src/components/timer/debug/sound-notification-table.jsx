import { formatTime } from '../../../lib/format'
import {
    currentPeriod,
    timerState,
    timerDurationElapsed
} from '../../../lib/timer'
import { SoundScheduler } from '../../../lib/sound-scheduler'
import { AVAILABLE_SOUNDS } from '../../../lib/sound-discovery'

const soundScheduler = new SoundScheduler(2000, AVAILABLE_SOUNDS)

export const SoundNotificationTable = () => {
    if (!currentPeriod.value) {
        return <p>No current period</p>
    }

    const period = currentPeriod.value
    const intendedDuration = period.periodUserIntendedDuration
    const periodType = period.type
    const elapsedMs = period.periodDurationElapsed

    // Determine next period type for timesup sound
    const currentIndex = timerState.value.currentPeriodIndex
    const nextIndex = currentIndex + 1
    const nextPeriod = timerState.value.periods[nextIndex]
    const nextPeriodType = nextPeriod ? nextPeriod.type : 'finish'

    const formatTimeFromMs = (ms) => {
        return formatTime(ms, false, false, true)
    }

    // Get all possible windows for this period
    const allWindows = soundScheduler.getAllPossibleWindows(intendedDuration, periodType, nextPeriodType)

    // Group windows by their target time ranges (overlapping windows)
    const groupedWindows = []
    const threshold = soundScheduler.getThreshold(intendedDuration)

    // Group windows that overlap (within window size, not 2x)
    for (const window of allWindows) {
        let addedToGroup = false

        for (const group of groupedWindows) {
            const groupTarget = group[0].targetMs
            if (Math.abs(window.targetMs - groupTarget) <= 2000) { // Same window size as scheduler
                group.push(window)
                addedToGroup = true
                break
            }
        }

        if (!addedToGroup) {
            groupedWindows.push([window])
        }
    }

    // Sort groups by target time and determine winners
    const processedGroups = groupedWindows
        .sort((a, b) => a[0].targetMs - b[0].targetMs)
        .map(group => {
            // Apply threshold filtering to the group
            const validWindows = group.filter(window => {
                // Use the target time as the reference for threshold filtering
                const referenceTime = window.targetMs
                if (window.type === 'elapsed' && referenceTime >= threshold) {
                    return false // Skip elapsed sounds at/after threshold
                }
                if (window.type === 'remaining' && referenceTime < threshold) {
                    return false // Skip remaining sounds before threshold
                }
                return true
            })

            if (validWindows.length === 0) return null

            // Select winner using the same logic as SoundScheduler
            const winner = soundScheduler.selectHighestPriority(validWindows)
            const competitors = validWindows.filter(w => w !== winner)
            const filteredOut = group.filter(w => !validWindows.includes(w))

            return {
                targetMs: group[0].targetMs,
                winner,
                competitors,
                filteredOut,
                allWindows: group,
                originalCount: group.length,
                validCount: validWindows.length
            }
        })
        .filter(Boolean)

    const getSoundType = (window) => {
        if (window.type === 'timesup') return 'timesup'
        if (window.type === 'elapsed') return `elapsed ${window.minutes}min`
        if (window.type === 'remaining') return `remaining ${window.minutes}min`
        if (window.type === 'overtime') return `overtime ${window.minutes}min`
        return window.type
    }

    const getSoundName = (window) => {
        if (window.type === 'timesup') {
            const soundType = nextPeriodType === 'finish' ? 'finish' : nextPeriodType
            return `timesup_${soundType}`
        }
        return window.key
    }

    const getStatus = (targetMs, elapsedMs) => {
        const windowSize = 2000 // Same as SoundScheduler
        const timeDiff = elapsedMs - targetMs

        if (timeDiff < -windowSize) {
            return 'future'
        } else if (Math.abs(timeDiff) <= windowSize) {
            return 'current'
        } else {
            return 'played'
        }
    }

    const getStatusDisplay = (status) => {
        switch (status) {
            case 'future': return { text: '⏳ Future', color: '#666', style: 'normal' }
            case 'current': return { text: '🔊 Active', color: '#e67e22', style: 'bold' }
            case 'played': return { text: '✓ Played', color: '#27ae60', style: 'normal' }
            default: return { text: status, color: '#666', style: 'normal' }
        }
    }

    return (
        <div style={{ marginBottom: '16px' }}>
            <h4 style={{ margin: '0 0 8px 0', fontSize: '0.9rem' }}>Sound Notifications for Current Period ({periodType})</h4>
            <div className="sound-notifications">
                <div className="sound-notifications__header">
                    <span>Status</span>
                    <span>Time from Start</span>
                    <span>Time from End</span>
                    <span>Time to Notification</span>
                    <span>Winner</span>
                    <span>Competitors</span>
                </div>
                {processedGroups.map((group, index) => {
                    const timeFromEnd = intendedDuration - group.targetMs
                    const status = getStatus(group.targetMs, elapsedMs)
                    const statusDisplay = getStatusDisplay(status)
                    const isCurrentlyActive = status === 'current'
                    const timeToNotification = group.targetMs - elapsedMs

                    return (
                        <div
                            key={index}
                            className={`sound-notifications__row ${isCurrentlyActive ? 'sound-notifications__row--active' : ''}`}
                        >
                            <span style={{
                                fontSize: '0.65rem',
                                color: statusDisplay.color,
                                fontWeight: statusDisplay.style
                            }}>
                                {statusDisplay.text}
                            </span>
                            <code>{formatTimeFromMs(group.targetMs)}</code>
                            <code>{timeFromEnd >= 0 ? `-${formatTimeFromMs(timeFromEnd)}` : `+${formatTimeFromMs(-timeFromEnd)}`}</code>
                            <code style={{
                                color: timeToNotification > 0 ? '#2196F3' : timeToNotification < -2000 ? '#999' : '#e67e22',
                                fontWeight: timeToNotification <= 2000 && timeToNotification >= -2000 ? 'bold' : 'normal'
                            }}>
                                {timeToNotification >= 0
                                    ? `in ${formatTimeFromMs(timeToNotification)}`
                                    : `${formatTimeFromMs(-timeToNotification)} ago`
                                }
                            </code>
                            <span style={{ fontSize: '0.7rem', fontWeight: 'bold', color: '#2d8f47' }}>
                                {getSoundName(group.winner)}
                            </span>
                            <span style={{ fontSize: '0.65rem', color: '#666', fontStyle: 'italic' }}>
                                {group.competitors.length > 0
                                    ? group.competitors.map(c => getSoundType(c)).join(', ')
                                    : group.filteredOut.length > 0
                                        ? group.filteredOut.map(c => getSoundType(c)).join(', ')
                                        : ''
                                }
                            </span>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
