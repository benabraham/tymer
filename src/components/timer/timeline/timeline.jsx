/**
 * Timeline component for rendering timer periods visually.
 * Uses memoization to avoid unnecessary renders.
 * Defensive against missing/empty periods.
 * @returns {JSX.Element}
 */
import { timerDuration, timerState } from '../../../lib/timer'
import { msToMinutes } from '../../../lib/format'
import { TimelinePeriod } from './timeline-period'
import { useMemo } from 'preact/hooks'
import { getTimelineData } from './timeline-logic'

export const Timeline = () => {
    // Memoize timeline periods for performance. Updates on timer state change.
    const timelinePeriods = useMemo(
        () =>
            getTimelineData({
                periods: timerState.value.periods,
                currentPeriodIndex: timerState.value.currentPeriodIndex,
            }),
        [timerState.value.periods, timerState.value.currentPeriodIndex, timerState.value.elapsed],
    )

    if (!timelinePeriods.length) return null

    return (
        <div class="timeline" style={`--total-minutes: ${msToMinutes(timerDuration.value)}`}>
            {timelinePeriods.map(props => (
                <TimelinePeriod {...props} />
            ))}
        </div>
    )
}
