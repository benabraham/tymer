import { timerDuration, timerState } from '../../../lib/timer'
import { msToMinutes } from '../../../lib/format'
import { TimelinePeriod } from './timeline-period'

export const Timeline = () => {
    return (
        <div class="timeline" style={`--total-minutes: ${msToMinutes(timerDuration.value)};`}>
            {timerState.value.periods.map((period, index) => (
                <TimelinePeriod
                    key={index}
                    period={period}
                    isActive={index === timerState.value.currentPeriodIndex}
                />
            ))}
        </div>
    )
}
