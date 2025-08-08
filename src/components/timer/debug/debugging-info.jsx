import { formatTime } from '../../../lib/format'
import {
    timerDuration,
    timerDurationElapsed,
    timerDurationRemaining,
    timerState,
    timerOnLastPeriod,
    timerHasFinished,
    shouldGoToNextPeriod,
} from '../../../lib/timer'
import { PeriodDetails } from './period-details'
import { SoundEventsLog } from './sound-events-log'

export const DebuggingInfo = () => {
    return (
        <details>
            <summary>Debugging values</summary>
            <p>
                <code>timerDuration</code> {formatTime(timerDuration.value, false, true)}
                <br />
                <code>timerDurationElapsed </code>{' '}
                {formatTime(timerDurationElapsed.value, true, true)}
                <br />
                <code>timerDurationRemaining </code>{' '}
                {formatTime(timerDurationRemaining.value, false, true)}
                <br />
                <code>currentPeriodIndex </code> {timerState.value.currentPeriodIndex}
                <br />
                <code>timestampStarted </code>{' '}
                {(timerState.value.timestampStarted || 0).toLocaleString()}
                <br />
                <code>timestampPaused </code>{' '}
                {(timerState.value.timestampPaused || 0).toLocaleString()}
                <br />
                <code>shouldGoToNextPeriod </code> {shouldGoToNextPeriod.value ? 'YES' : 'no'}
                <br />
                <code>timerOnLastPeriod </code> {timerOnLastPeriod.value ? 'YES' : 'no'}
                <br />
                <code>timerHasFinished </code> {timerHasFinished.value ? 'YES' : 'no'}
            </p>

            <PeriodDetails />
            
            <hr style={{ margin: '16px 0', borderColor: '#ddd' }} />
            
            <SoundEventsLog />
        </details>
    )
}
