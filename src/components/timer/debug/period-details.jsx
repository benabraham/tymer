import { formatTime } from '../../../format'
import { timerState } from '../../../timer'

export const PeriodDetails = () => (
    <div class="tempPeriods">
        <div class="tempPeriod">
            <div class="tempPeriod__data">Type</div>
            <div class="tempPeriod__data">Duration</div>
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
                <div class="tempPeriod__data">{formatTime(period.periodDuration, false, true)}</div>
                <div class="tempPeriod__data">{formatTime(period.periodDurationRemaining, false, true)}</div>
                <div class="tempPeriod__data">{formatTime(period.periodDurationElapsed, true, true)}</div>
                <div class="tempPeriod__data">{period.periodHasFinished ? 'yes' : 'no'}</div>
            </div>
        ))}
    </div>
) 