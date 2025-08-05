import { useEffect } from 'preact/hooks'
import { initializeTimer, timerState, currentPeriod } from '../../lib/timer'
import { formatTime } from '../../lib/format'
import { Timeline } from './timeline/timeline'
import { TimerControls } from './controls/timer-controls'
import { PeriodControls } from './controls/period-controls'
import { Stats } from './stats/stats'
import { DebuggingInfo } from './debug/debugging-info'

export function Timer() {
    useEffect(() => {
        initializeTimer()
    }, [])

    // Update document title based on timer state
    useEffect(() => {
        const isRunning = timerState.value.runningIntervalId !== null
        const period = currentPeriod.value

        if (isRunning && period) {
            // Check if both times are under 60 minutes to determine format
            const bothUnderOneHour = period.periodDurationRemaining < 60 * 60 * 1000 && period.periodDuration < 60 * 60 * 1000

            let formattedPeriodDurationElapsed, periodUserIntendedDuration

            if (bothUnderOneHour) {
                // Show only minutes when both are under 60 minutes
                formattedPeriodDurationElapsed = Math.ceil(period.periodDurationElapsed / (60 * 1000)).toString()
                periodUserIntendedDuration = Math.ceil(period.periodUserIntendedDuration / (60 * 1000)).toString()
            } else {
                // Use full hours:minutes format
                formattedPeriodDurationElapsed = formatTime(period.periodDurationElapsed, true)
                periodUserIntendedDuration = formatTime(period.periodUserIntendedDuration, true)
            }

            const periodTypeInitial = period.type.charAt(0).toUpperCase()
            const isOvertime = period.periodDurationElapsed > period.periodUserIntendedDuration
            const overtimeIndicator = isOvertime ? '🛑 ' : ''
            document.title = `${periodTypeInitial} ${overtimeIndicator}${formattedPeriodDurationElapsed}/${periodUserIntendedDuration}`
        } else {
            document.title = 'Tymer'
        }
    }, [
        timerState.value.runningIntervalId,
        currentPeriod.value?.periodDurationRemaining,
        currentPeriod.value?.periodDurationElapsed,
        currentPeriod.value?.periodUserIntendedDuration,
        currentPeriod.value?.type,
    ])

    return (
        <>
            <TimerControls />ove
            <Timeline />
            <PeriodControls />
            <Stats />
            <DebuggingInfo />
        </>
    )
}
