import { msToMinutes, formatTime } from '../../../lib/format'
import { TimelineCurrentTime } from './timeline-current-time'

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

            <div
                class="timeline__elapsed-time"
                style={`--elapsed-minutes: ${msToMinutes(period.periodDurationElapsed)};`}
            >
                {isActive && <TimelineCurrentTime period={period} />}
            </div>
        </div>
    )
}
