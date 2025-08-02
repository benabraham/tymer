import { msToMinutes, formatTime } from '../../../lib/format'
import { TimelineCurrentTime } from './timeline-current-time'

export const TimelinePeriod = ({ period, isActive, endTime, startTime, index }) => {
    return (
        <div
            className={`
                timeline__period
                timeline__period--${period.type}
                ${isActive ? 'timeline__period--active' : ''}
            `}
            style={`--period-minutes: ${msToMinutes(period.periodDuration)};`}
        >
            <div className="timeline__text">
                {period.type} {formatTime(period.periodDuration)}
                {endTime && <span class="timeline__end-time">{endTime}</span>}
            </div>

            {index === 0 && startTime && <span class="timeline__start-time">{startTime}</span>}

            <div
                className="timeline__elapsed-time"
                style={`--elapsed-minutes: ${msToMinutes(period.periodDurationElapsed)};`}
            >
                {isActive && <TimelineCurrentTime period={period}/>}
            </div>
            {isActive && <div className="timeline__subinterval"></div>}
            {isActive && period.periodDurationElapsed > period.periodUserIntendedDuration && 
                <div className="timeline__userintended"></div>
            }
        </div>
    )
}
