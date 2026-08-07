/**
 * Timeline component for rendering timer periods visually.
 * Uses memoization to avoid unnecessary renders.
 * Defensive against missing/empty periods.
 */

import type { JSX } from 'preact'
import { useEffect, useMemo, useRef } from 'preact/hooks'
import { clocksVisible } from '../../../lib/clocks'
import { compactMode } from '../../../lib/compact'
import { deadlineOccurrences } from '../../../lib/deadline'
import { msToMinutes } from '../../../lib/format'
import { Schedule } from '../../../lib/schedule'
import { autoEditIndex, sessionStartTimestamp, timerDuration, timerState } from '../../../lib/timer'
import { TimelineDeadline } from './timeline-deadline'
import { calculateTimelineMinutes, getTimelineData } from './timeline-logic'
import { TimelinePeriod } from './timeline-period'

export const Timeline = () => {
    const timelineRef = useRef<HTMLDivElement>(null)

    // Auto-focus timeline on mount
    useEffect(() => {
        timelineRef.current?.focus()
    }, [])

    // Handle Enter key when timeline is focused
    const handleKeyDown = (event: JSX.TargetedKeyboardEvent<HTMLDivElement>) => {
        if (event.key === 'Enter' && Schedule.currentPeriodIndex.value !== null) {
            event.preventDefault()
            autoEditIndex.value = Schedule.currentPeriodIndex.value
        }
    }

    // Memoize timeline periods for performance. Updates on timer state change.
    const timelinePeriods = useMemo(
        () =>
            getTimelineData({
                periods: timerState.value.periods,
                currentPeriodIndex: Schedule.currentPeriodIndex.value,
                anchorMs: Schedule.timestampAnchor.value,
            }),
        [
            timerState.value.periods,
            Schedule.currentPeriodIndex.value,
            // `TimerState` has no `elapsed` field — this dependency is always
            // `undefined` and never changes. Pre-existing (see report), left as-is.
            (timerState.value as unknown as { elapsed?: unknown }).elapsed,
            Schedule.timestampAnchor.value,
        ],
    )

    if (!timelinePeriods.length) return null

    // Deadlines beyond the session end extend the grid with empty track (see
    // calculateTimelineMinutes). sessionStartTimestamp is jitter-free, so the
    // grid size only changes when a full minute actually passes.
    const deadlineTimestamps = deadlineOccurrences.value.map(o => o.timestamp)
    const totalMinutes = deadlineTimestamps.length
        ? calculateTimelineMinutes({
              durationMs: timerDuration.value,
              sessionStart: sessionStartTimestamp.value,
              deadlineTimestamps,
          })
        : msToMinutes(timerDuration.value)

    return (
        <div
            ref={timelineRef}
            class={`timeline ${compactMode.value ? 'timeline--compact' : ''} ${
                clocksVisible.value ? '' : 'timeline--clocks-hidden'
            }`}
            style={`--total-minutes: ${totalMinutes}`}
            tabIndex={0}
            onKeyDown={handleKeyDown}
        >
            {timelinePeriods.map(props => (
                <TimelinePeriod {...props} />
            ))}
            <TimelineDeadline />
        </div>
    )
}
