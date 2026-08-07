import { faBellSlash } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { format } from 'date-fns'
import {
    type DeadlineOccurrence,
    deadlineAlarmActive,
    deadlineAlarmTimestamp,
    deadlineDayMarker,
    deadlineNow,
    deadlineOccurrences,
    silenceDeadlineAlarm,
} from '../../../lib/deadline'
import { formatTime } from '../../../lib/format'
import { Schedule } from '../../../lib/schedule'
import { playSound } from '../../../lib/sounds'
import { timerDuration, timerDurationElapsed } from '../../../lib/timer'

type MarkerProps = {
    occurrence: DeadlineOccurrence
    offsetMinutes: number
}

const TimelineDeadlineMarker = ({ occurrence, offsetMinutes }: MarkerProps) => {
    const now = deadlineNow.value
    const { timestamp, deadline } = occurrence
    const dayMarker = deadlineDayMarker(timestamp, now)
    const time = format(timestamp, 'H:mm')
    // The red light is tied to being overdue, NOT to the alarm: a silenced or
    // superseded deadline keeps pulsing red — only the sound stops.
    const overdue = now >= timestamp
    // Time to/past the deadline, always shown left of the line: "0:01" one
    // minute before, "-0:01" one minute after.
    const countdown = overdue
        ? `-${formatTime(now - timestamp, { mode: 'elapsed' })}`
        : formatTime(timestamp - now, { mode: 'remaining' })
    // The alarm belongs to the latest expired occurrence only.
    const alarming = deadlineAlarmActive.value && timestamp === deadlineAlarmTimestamp.value

    const handleSilence = (event: MouseEvent) => {
        event.stopPropagation()
        playSound('button') // also cuts the currently looping chime short
        silenceDeadlineAlarm()
    }

    return (
        <div
            class={`timeline__deadline ${overdue ? 'timeline__deadline--overdue' : ''}`}
            style={`--deadline-minutes: ${offsetMinutes};`}
            title={`Deadline ${dayMarker ? `${dayMarker} ` : ''}${time}${
                deadline.label ? ` — ${deadline.label}` : ''
            }`}
        >
            <span class="timeline__deadline-countdown">{countdown}</span>
            <span class="timeline__deadline-label">
                {dayMarker && <span class="timeline__deadline-day">{dayMarker} </span>}
                {time}
                {deadline.label && ` ${deadline.label}`}
                {alarming && (
                    <button
                        type="button"
                        class="timeline__deadline-silence"
                        aria-label="Silence deadline alarm (S)"
                        title="Silence deadline alarm (S)"
                        onClick={handleSilence}
                    >
                        <FontAwesomeIcon icon={faBellSlash} />
                    </button>
                )}
            </span>
        </div>
    )
}

// Dashed wall-clock markers over the timeline, one per deadline. The timeline
// maps the session's start..end to its width, so each marker sits at its
// deadline's clock position and slides as the (unanchored) start re-derives
// from "now" each second. A deadline outside the session's span clamps to the
// nearest edge — a set deadline is always visible; the label carries the exact
// time regardless.
export const TimelineDeadline = () => {
    const occurrences = deadlineOccurrences.value
    if (!occurrences.length) return null

    const now = deadlineNow.value
    const sessionStart = Schedule.timestampAnchor.value ?? now - timerDurationElapsed.value
    const totalMinutes = timerDuration.value / 60000

    return (
        <>
            {occurrences.map(occurrence => (
                <TimelineDeadlineMarker
                    key={`${occurrence.timestamp}|${occurrence.deadline.label}`}
                    occurrence={occurrence}
                    offsetMinutes={Math.min(
                        Math.max((occurrence.timestamp - sessionStart) / 60000, 0),
                        totalMinutes,
                    )}
                />
            ))}
        </>
    )
}
