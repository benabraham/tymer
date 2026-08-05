/**
 * Timeline component for rendering timer periods visually.
 * Uses memoization to avoid unnecessary renders.
 * Defensive against missing/empty periods.
 */

import type { JSX } from 'preact'
import { useEffect, useMemo, useRef } from 'preact/hooks'
import { clocksVisible } from '../../../lib/clocks'
import { compactMode } from '../../../lib/compact'
import { msToMinutes } from '../../../lib/format'
import { Schedule } from '../../../lib/schedule'
import { autoEditIndex, timerDuration, timerState } from '../../../lib/timer'
import { getTimelineData } from './timeline-logic'
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

    return (
        <div
            ref={timelineRef}
            class={`timeline ${compactMode.value ? 'timeline--compact' : ''} ${
                clocksVisible.value ? '' : 'timeline--clocks-hidden'
            }`}
            style={`--total-minutes: ${msToMinutes(timerDuration.value)}`}
            tabIndex={0}
            onKeyDown={handleKeyDown}
        >
            {timelinePeriods.map(props => (
                <TimelinePeriod {...props} />
            ))}
        </div>
    )
}
