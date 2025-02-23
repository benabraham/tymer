import { msToMinutes, formatTime } from '../../../lib/format'
import { TimelinePeriodDetails } from './timeline-period-details'

export const TimelinePeriod = ({ period, isActive }) => {
    return (
        <div
            class={`
                timeline__period
                timeline__period--${period.type}
                ${isActive ? 'timeline__period--active' : ''}
            `}
            style={`--period-minutes: ${msToMinutes(period.periodDuration)};`}
        >
            <div class="timeline__text">
                {period.type} {formatTime(period.periodDuration)}
            </div>

            {isActive && <TimelinePeriodDetails period={period} />}
        </div>
    )
}
