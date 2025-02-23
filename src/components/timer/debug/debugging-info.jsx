import { formatTime } from '../../../format'
import {
    timerDuration,
    timerDurationElapsed,
    timerDurationRemaining,
    timerState,
    timerOnLastPeriod,
    timerHasFinished
} from '../../../timer'
import { PeriodDetails } from './period-details'

export const DebuggingInfo = () => {
    return (
        <details>
            <summary>Debugging values</summary>
            <p>
                <code>timerDuration</code> {formatTime(timerDuration.value, false, true)}<br/>
                <code>timerDurationElapsed </code> {formatTime(timerDurationElapsed.value, true, true)}<br/>
                <code>timerDurationRemaining </code> {formatTime(timerDurationRemaining.value, false, true)}<br/>
                <code>currentPeriodIndex </code> {timerState.value.currentPeriodIndex}<br/>
                <code>timestampStarted </code> {(timerState.value.timestampStarted || 0).toLocaleString()}<br/>
                <code>timestampPaused </code> {(timerState.value.timestampPaused || 0).toLocaleString()}<br/>
                <code>shouldGoToNextPeriod </code> {timerState.value.shouldGoToNextPeriod ? 'YES' : 'no'}<br/>
                <code>timerOnLastPeriod </code> {timerOnLastPeriod.value ? 'YES' : 'no'}<br/>
                <code>timerHasFinished </code> {timerHasFinished.value ? 'YES' : 'no'}
            </p>

            <PeriodDetails />
        </details>
    )
} 