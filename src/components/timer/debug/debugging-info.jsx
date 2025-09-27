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
import { SoundNotificationTable } from './sound-notification-table'

export const DebuggingInfo = () => {
    return (
        <details>
            <summary>Debugging values</summary>

            <SoundNotificationTable />

            <p>
                <code>timerDuration</code> {formatTime(timerDuration.value, false, false, true)}
                <br />
                <code>timerDurationElapsed </code>{' '}
                {formatTime(timerDurationElapsed.value, true, false, true)}
                <br />
                <code>timerDurationRemaining </code>{' '}
                {formatTime(timerDurationRemaining.value, false, true, true)}
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
        </details>
    )
}
