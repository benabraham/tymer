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
            const formattedPeriodDurationRemaining = formatTime(
                period.periodDurationRemaining,
                true,
            )
            const formattedPeriodDuration = formatTime(period.periodDuration, true)
            const periodTypeInitial = period.type.charAt(0).toUpperCase()
            document.title = `${formattedPeriodDurationRemaining}/${formattedPeriodDuration} ${periodTypeInitial} | Tymer`
        } else {
            document.title = 'Tymer'
        }
    }, [
        timerState.value.runningIntervalId,
        currentPeriod.value?.periodDurationRemaining,
        currentPeriod.value?.type,
    ])

    return (
        <>
            <TimerControls />
            <Timeline />
            <PeriodControls />
            <Stats />
            <DebuggingInfo />
        </>
    )
}
