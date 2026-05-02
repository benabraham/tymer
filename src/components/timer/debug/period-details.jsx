import { formatTime } from '../../../lib/format'
import { timerState } from '../../../lib/timer'

const getPeriodLifecycle = (index, currentPeriodIndex) => {
    if (currentPeriodIndex === null) return 'Future'
    if (index < currentPeriodIndex) return 'Past'
    if (index === currentPeriodIndex) return 'Current'
    return 'Future'
}

export const PeriodDetails = () => (
    <div class="tempPeriods">
        <div class="tempPeriod">
            <div class="tempPeriod__data">Type</div>
            <div class="tempPeriod__data">Duration</div>
            <div class="tempPeriod__data">User Intended</div>
            <div class="tempPeriod__data">Remaining</div>
            <div class="tempPeriod__data">Elapsed</div>
            <div class="tempPeriod__data">Lifecycle</div>
        </div>
        {timerState.value.periods.map((period, index) => {
            const lifecycle = getPeriodLifecycle(index, timerState.value.currentPeriodIndex)
            return (
                <div
                    key={index}
                    class={`
                    tempPeriod
                    ${lifecycle === 'Current' ? 'tempPeriod--current' : ''}
                    ${lifecycle === 'Past' ? 'tempPeriod--finished' : ''}
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
                    <div class="tempPeriod__data">{lifecycle}</div>
                </div>
            )
        })}
    </div>
)
