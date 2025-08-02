import { msToMinutes, formatTime } from '../../../lib/format'
import { currentPeriod, timerState } from '../../../lib/timer'

export const TimelineCurrentTime = ({ period }) => (
    <>
        <div
            class="timeline__current-time"
            style={`--elapsed-minutes: ${msToMinutes(period.periodDurationElapsed)};`}
        >
            <span class="timeline__elapsed timeline__elapsed--period">
                {formatTime(currentPeriod.value.periodDurationElapsed, true)}
                <span class="timeline__symbol"> ◀▶ </span>
                {formatTime(currentPeriod.value.periodDurationRemaining)}
            </span>
            <span class="timeline__elapsed timeline__elapsed--timer">
                {formatTime(
                    timerState.value.periods.reduce((sum, p) => sum + p.periodDurationElapsed, 0),
                    true,
                )}
            </span>
        </div>
    </>
)
