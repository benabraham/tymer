import { useEffect } from 'preact/hooks'
import { initializeTimer, timerState, currentPeriod } from '../../lib/timer'
import { formatTime } from '../../lib/format'
import { unlockAudio } from '../../lib/sounds'
import { Timeline } from './timeline/timeline'
import { TimerControls } from './controls/timer-controls'
import { PeriodControls } from './controls/period-controls'
import { Stats } from './stats/stats'
import { DebuggingInfo } from './debug/debugging-info'
import { BuildInfo } from '../build-info/build-info'

export function Timer() {
    useEffect(() => {
        initializeTimer()
    }, [])

    // Global audio unlock on any user interaction for PWA
    useEffect(() => {
        const unlockOnInteraction = async () => {
            await unlockAudio()
        }

        // Listen for multiple interaction types to ensure audio unlock
        const events = ['click', 'touchstart', 'keydown']
        events.forEach(event => {
            document.addEventListener(event, unlockOnInteraction, { once: true })
        })

        return () => {
            events.forEach(event => {
                document.removeEventListener(event, unlockOnInteraction)
            })
        }
    }, [])

    // Update document title based on timer state
    useEffect(() => {
        const isRunning = timerState.value.runningIntervalId !== null
        const period = currentPeriod.value

        if (isRunning && period) {
            // Check if both times are under 60 minutes to determine format
            const bothUnderOneHour =
                period.periodDurationRemaining < 60 * 60 * 1000
                && period.periodDuration < 60 * 60 * 1000

            let formattedPeriodDurationElapsed, periodUserIntendedDuration

            if (bothUnderOneHour) {
                // Show only minutes when both are under 60 minutes
                formattedPeriodDurationElapsed = Math.ceil(
                    period.periodDurationElapsed / (60 * 1000),
                ).toString()
                periodUserIntendedDuration = Math.ceil(
                    period.periodUserIntendedDuration / (60 * 1000),
                ).toString()
            } else {
                // Use full hours:minutes format
                formattedPeriodDurationElapsed = formatTime(
                    period.periodDurationElapsed,
                    true,
                    false,
                )
                periodUserIntendedDuration = formatTime(
                    period.periodUserIntendedDuration,
                    true,
                    false,
                )
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
            <BuildInfo />
            <TimerControls />
            <Timeline />
            <PeriodControls />
            <Stats />
            <DebuggingInfo />
        </>
    )
}
