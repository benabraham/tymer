import { formatTime } from '../../../lib/format'
import {
    timerDuration,
    timerDurationElapsed,
    timerDurationRemaining,
    timerOnLastPeriod,
    timerHasFinished,
    shouldGoToNextPeriod,
} from '../../../lib/timer'
import { Schedule } from '../../../lib/schedule'
import { PeriodDetails } from './period-details'
import { SoundNotificationTable } from './sound-notification-table'

export const DebuggingInfo = () => {
    return (
        <div class="debugging-info">
            <h2>Debugging info</h2>
            <SoundNotificationTable />

            <p>
                <code>timerDuration</code> {formatTime(timerDuration.value, { debug: true })}
                <br />
                <code>timerDurationElapsed </code>{' '}
                {formatTime(timerDurationElapsed.value, { mode: 'elapsed', debug: true })}
                <br />
                <code>timerDurationRemaining </code>{' '}
                {formatTime(timerDurationRemaining.value, { mode: 'remaining', debug: true })}
                <br />
                <code>currentPeriodIndex </code> {Schedule.currentPeriodIndex.value}
                <br />
                <code>timestampStarted </code>{' '}
                {(Schedule.timestampStarted.value || 0).toLocaleString()}
                <br />
                <code>timestampPaused </code>{' '}
                {(Schedule.timestampPaused.value || 0).toLocaleString()}
                <br />
                <code>shouldGoToNextPeriod </code> {shouldGoToNextPeriod.value ? 'YES' : 'no'}
                <br />
                <code>timerOnLastPeriod </code> {timerOnLastPeriod.value ? 'YES' : 'no'}
                <br />
                <code>timerHasFinished </code> {timerHasFinished.value ? 'YES' : 'no'}
            </p>

            <PeriodDetails />
        </div>
    )
}
