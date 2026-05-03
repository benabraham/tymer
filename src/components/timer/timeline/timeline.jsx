/**
 * Timeline component for rendering timer periods visually.
 * Uses memoization to avoid unnecessary renders.
 * Defensive against missing/empty periods.
 * @returns {JSX.Element}
 */
import { timerDuration, timerState, autoEditIndex } from '../../../lib/timer'
import { Schedule } from '../../../lib/schedule'
import { msToMinutes } from '../../../lib/format'
import { TimelinePeriod } from './timeline-period'
import { useMemo, useEffect, useRef } from 'preact/hooks'
import { getTimelineData } from './timeline-logic'

export const Timeline = () => {
    const timelineRef = useRef(null)

    // Auto-focus timeline on mount
    useEffect(() => {
        timelineRef.current?.focus()
    }, [])

    // Handle Enter key when timeline is focused
    const handleKeyDown = event => {
        if (event.key === 'Enter' && Schedule.currentPeriodIndex.value !== null) {
            event.preventDefault()
            autoEditIndex.value = Schedule.currentPeriodIndex.value
        }
    }

    // Memoize timeline periods for performance. Updates on timer state change.
    const timelinePeriods = useMemo(
        () =>
            getTimelineData({
                periods: timerState.value.periods,
                currentPeriodIndex: Schedule.currentPeriodIndex.value,
            }),
        [timerState.value.periods, Schedule.currentPeriodIndex.value, timerState.value.elapsed],
    )

    if (!timelinePeriods.length) return null

    return (
        <div
            ref={timelineRef}
            class="timeline"
            style={`--total-minutes: ${msToMinutes(timerDuration.value)}`}
            tabIndex={0}
            onKeyDown={handleKeyDown}
        >
            {timelinePeriods.map(props => (
                <TimelinePeriod {...props} />
            ))}
        </div>
    )
}
