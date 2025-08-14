import { msToMinutes, formatTime } from '../../../lib/format'
import { currentPeriod, timerState } from '../../../lib/timer'

export const TimelineCurrentTime = ({ period }) => (
    <>
        <div
            class="timeline__current-time"
            style={`--elapsed-minutes: ${msToMinutes(period.periodDurationElapsed)};`}
        >
            <span class="timeline__elapsed timeline__elapsed--period">
                {formatTime(currentPeriod.value.periodDurationElapsed, true, false)}
                <span class="timeline__symbol"> ◀▶ </span>
                {formatTime(currentPeriod.value.periodDurationRemaining, false, true)}
            </span>
            <span class="timeline__elapsed timeline__elapsed--timer">
                {formatTime(
                    timerState.value.periods.reduce((sum, p) => sum + p.periodDurationElapsed, 0),
                    true,
                    false,
                )}
            </span>
        </div>
    </>
)
