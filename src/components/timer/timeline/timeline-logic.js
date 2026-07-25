/**
 * Timeline logic helpers for timer periods
 * All functions use RORO (Receive an Object, Return an Object) pattern.
 * Defensive against invalid or missing input.
 * Modern JS, Baseline 2023 compatible.
 */
import { format } from 'date-fns'
import { formatDayMarker } from '../../../lib/format'

/**
 * Calculate formatted end times for all periods.
 * @param {Object} params
 * @param {Array} params.periods - List of timer periods
 * @param {number|null} params.currentPeriodIndex - Active period index
 * @returns {string[]} Array of formatted end times
 */
export const calculateEndTimes = ({ periods, currentPeriodIndex }) => {
    if (!Array.isArray(periods) || !periods.length) return []
    const now = Date.now()
    const totalElapsed = periods.reduce((acc, period) => acc + (period.state.elapsed || 0), 0)
    let sumPeriodDurations = 0
    let prevEnd = null
    return periods.map((period, idx) => {
        if (currentPeriodIndex == null) {
            // No active period: idle (nothing elapsed) projects the schedule
            // forward from now; completed (everything elapsed) counts BACK from
            // now, so a finished session keeps showing its historical times
            // instead of suddenly jumping to a future projection.
            prevEnd = (prevEnd ?? now - totalElapsed) + period.state.duration
            return format(new Date(prevEnd), "HH'<br>'mm")
        }
        if (idx < currentPeriodIndex) {
            sumPeriodDurations += period.state.duration
            const startTime = now - totalElapsed + (sumPeriodDurations - period.state.duration)
            const end = startTime + period.state.duration
            prevEnd = end
            return format(new Date(end), "HH'<br>'mm")
        }
        if (idx === currentPeriodIndex) {
            const periodRemaining = period.state.duration - (period.state.elapsed || 0)
            const end = now + periodRemaining
            prevEnd = end
            return format(new Date(end), "HH'<br>'mm")
        }
        prevEnd = (prevEnd ?? now) + period.state.duration
        return format(new Date(prevEnd), "HH'<br>'mm")
    })
}

/**
 * Calculate formatted start time for the timeline.
 * @param {Object} params
 * @param {Array} params.periods - List of timer periods
 * @param {number|null} [params.anchorMs] - When set (session is pinned), the
 *   start time is formatted from this stable timestamp instead of
 *   `now - totalElapsed`, avoiding per-second recompute jitter.
 * @returns {string} Formatted start time
 */
export const calculateStartTime = ({ periods, anchorMs = null }) => {
    if (!Array.isArray(periods) || !periods.length) return ''
    const now = Date.now()
    const totalElapsed = periods.reduce((acc, p) => acc + (p.state.elapsed || 0), 0)
    const startMs = anchorMs ?? now - totalElapsed
    const time = format(new Date(startMs), "HH'<br>'mm")
    // Sessions crossing midnight (or reloaded days later) qualify the start
    // time with the day it belongs to.
    const dayMarker = formatDayMarker(startMs, now)
    return dayMarker ? `${dayMarker}<br>${time}` : time
}

/**
 * Get all props for TimelinePeriod components.
 * @param {Object} params
 * @param {Array} params.periods
 * @param {number|null} params.currentPeriodIndex
 * @returns {Array<Object>} Array of props for TimelinePeriod
 */
export const getTimelineData = ({ periods, currentPeriodIndex, anchorMs = null }) => {
    if (!Array.isArray(periods) || !periods.length) return []

    const endTimes = calculateEndTimes({ periods, currentPeriodIndex })
    const startTime = calculateStartTime({ periods, anchorMs })

    const createPeriodProps = (period, index) => ({
        key: index,
        period,
        isActive: index === currentPeriodIndex,
        endTime: endTimes[index],
        startTime: index === 0 ? startTime : undefined,
        index,
    })

    return periods.map(createPeriodProps)
}
