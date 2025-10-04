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
                    ${period.periodHasFinished ? 'tempPeriod--finished' : ''}
                `}
            >
                <div class="tempPeriod__data">{period.type}</div>
                <div class="tempPeriod__data">
                    {formatTime(period.periodDuration, { debug: true })}
                </div>
                <div class="tempPeriod__data">
                    {period.periodUserIntendedDuration === period.periodDuration
                        ? 'same as duration'
                        : formatTime(period.periodUserIntendedDuration, { debug: true })}
                </div>
                <div class="tempPeriod__data">
                    {formatTime(period.periodDurationRemaining, { mode: 'remaining', debug: true })}
                </div>
                <div class="tempPeriod__data">
                    {formatTime(period.periodDurationElapsed, { mode: 'elapsed', debug: true })}
                </div>
                <div class="tempPeriod__data">{period.periodHasFinished ? 'yes' : 'no'}</div>
            </div>
        ))}
    </div>
)
