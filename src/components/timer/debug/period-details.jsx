import { formatTime } from '../../../lib/format'
import { timerState } from '../../../lib/timer'

export const PeriodDetails = () => (
    <div class="tempPeriods">
        <div class="tempPeriod">
            <div class="tempPeriod__data">Type</div>
            <div class="tempPeriod__data">Duration</div>
            <div class="tempPeriod__data">User Intended</div>
            <div class="tempPeriod__data">Remaining</div>
            <div class="tempPeriod__data">Elapsed</div>
            <div class="tempPeriod__data">Finished</div>
        </div>
        {timerState.value.periods.map((period, index) => (
            <div
                key={index}
                class={`
                    tempPeriod 
                    ${index === timerState.value.currentPeriodIndex ? 'tempPeriod--current' : ''}
                    ${period.state.finished ? 'tempPeriod--finished' : ''}
                `}
            >
                <div class="tempPeriod__data">{period.config.type}</div>
                <div class="tempPeriod__data">
                    {formatTime(period.state.duration, { debug: true })}
                </div>
                <div class="tempPeriod__data">
                    {period.config.userIntendedDuration === period.state.duration
                        ? 'same as duration'
                        : formatTime(period.config.userIntendedDuration, { debug: true })}
                </div>
                <div class="tempPeriod__data">
                    {formatTime(period.state.remaining, { mode: 'remaining', debug: true })}
                </div>
                <div class="tempPeriod__data">
                    {formatTime(period.state.elapsed, { mode: 'elapsed', debug: true })}
                </div>
                <div class="tempPeriod__data">{period.state.finished ? 'yes' : 'no'}</div>
            </div>
        ))}
    </div>
)
