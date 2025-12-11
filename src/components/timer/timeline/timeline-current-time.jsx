import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCaretLeft, faCaretRight } from '@fortawesome/free-solid-svg-icons'
import { msToMinutes, formatTime } from '../../../lib/format'
import { currentPeriod, timerState } from '../../../lib/timer'
import { clocksVisible } from '../../../lib/clocks'
import { useSignal } from '@preact/signals'
import { useEffect } from 'preact/hooks'

export const TimelineCurrentTime = ({ period }) => {
    const currentTime = useSignal(new Date())

    useEffect(() => {
        const interval = setInterval(() => {
            currentTime.value = new Date()
        }, 1000)
        return () => clearInterval(interval)
    }, [])

    const formatClockTime = date => {
        const hours = date.getHours().toString().padStart(2, '\u2007') // figure space
        const minutes = date.getMinutes().toString().padStart(2, '0')
        return `${hours} ${minutes}`
    }

    return (
        <div
            class="timeline__current-time"
            style={`--elapsed-minutes: ${msToMinutes(period.periodDurationElapsed)};`}
        >
            <span class="timeline__elapsed timeline__elapsed--total">
                {formatTime(
                    timerState.value.periods.reduce((sum, p) => sum + p.periodDurationElapsed, 0),
                    { mode: 'elapsed', figureSpace: true },
                )}
            </span>
            <span class="timeline__elapsed timeline__elapsed--period">
                {formatTime(currentPeriod.value.periodDurationElapsed, { mode: 'elapsed' })}
                <span class="timeline__symbol">
                    {' '}
                    <FontAwesomeIcon icon={faCaretLeft} />
                    <FontAwesomeIcon icon={faCaretRight} />{' '}
                </span>
                {formatTime(currentPeriod.value.periodDurationRemaining, { mode: 'remaining' })}
            </span>
            {clocksVisible.value && (
                <span class="timeline__elapsed timeline__elapsed--clock">
                    {formatClockTime(currentTime.value)}
                </span>
            )}
        </div>
    )
}
