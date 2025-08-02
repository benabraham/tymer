/**
 * Timeline logic helpers for timer periods
 * All functions use RORO (Receive an Object, Return an Object) pattern.
 * Defensive against invalid or missing input.
 * Modern JS, Baseline 2023 compatible.
 */
import { format } from 'date-fns'

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
    const totalElapsed = periods.reduce(
        (acc, period) => acc + (period.periodDurationElapsed || 0),
        0,
    )
    let sumPeriodDurations = 0
    let prevEnd = null
    return periods.map((period, idx) => {
        if (currentPeriodIndex == null) {
            prevEnd = (prevEnd ?? now) + period.periodDuration
            return format(new Date(prevEnd), 'H:mm')
        }
        if (idx < currentPeriodIndex) {
            sumPeriodDurations += period.periodDuration
            const startTime = now - totalElapsed + (sumPeriodDurations - period.periodDuration)
            const end = startTime + period.periodDuration
            prevEnd = end
            return format(new Date(end), 'H:mm')
        }
        if (idx === currentPeriodIndex) {
            const periodRemaining = period.periodDuration - (period.periodDurationElapsed || 0)
            const end = now + periodRemaining
            prevEnd = end
            return format(new Date(end), 'H:mm')
        }
        prevEnd = (prevEnd ?? now) + period.periodDuration
        return format(new Date(prevEnd), 'H:mm')
    })
}

/**
 * Calculate formatted start time for the timeline.
 * @param {Object} params
 * @param {Array} params.periods - List of timer periods
 * @returns {string} Formatted start time
 */
export const calculateStartTime = ({ periods }) => {
    if (!Array.isArray(periods) || !periods.length) return ''
    const now = Date.now()
    const totalElapsed = periods.reduce((acc, p) => acc + (p.periodDurationElapsed || 0), 0)
    return format(new Date(now - totalElapsed), 'H:mm')
}

/**
 * Get all props for TimelinePeriod components.
 * @param {Object} params
 * @param {Array} params.periods
 * @param {number|null} params.currentPeriodIndex
 * @returns {Array<Object>} Array of props for TimelinePeriod
 */
export const getTimelineData = ({ periods, currentPeriodIndex }) => {
    if (!Array.isArray(periods) || !periods.length) return []

    const endTimes = calculateEndTimes({ periods, currentPeriodIndex })
    const startTime = calculateStartTime({ periods })

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
