import {msToMinutes, formatTime} from '../../../lib/format'
import {TimelineCurrentTime} from './timeline-current-time'

export const TimelinePeriod = ({period, isActive, endTime, startTime, index}) => {
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
                <div class="timeline__type">
                    {period.type}
                    {period.note && <div className="timeline__note">{period.note}</div>}
                </div>
                <div class="timeline__period-duration">
                    {formatTime(period.periodDuration)}
                </div>

                {index === 0 && startTime && <div class="timeline__start-time">{startTime}</div>}
                <div class="timeline__end-time">{endTime}</div>
            </div>


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
