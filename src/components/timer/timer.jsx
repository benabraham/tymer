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
import { KeyboardShortcuts } from './keyboard-shortcuts'

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
                // Use Math.floor for elapsed time (show completed minutes only)
                formattedPeriodDurationElapsed = Math.floor(
                    period.periodDurationElapsed / (60 * 1000),
                ).toString()
                // Use Math.round for duration (total intended duration)
                periodUserIntendedDuration = Math.round(
                    period.periodUserIntendedDuration / (60 * 1000),
                ).toString()
            } else {
                // Use full hours:minutes format
                // Use mode: 'elapsed' to floor elapsed time
                formattedPeriodDurationElapsed = formatTime(
                    period.periodDurationElapsed,
                    { mode: 'elapsed' },
                )
                // Duration doesn't need special rounding mode (defaults to round)
                periodUserIntendedDuration = formatTime(
                    period.periodUserIntendedDuration,
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
            <KeyboardShortcuts />
            <BuildInfo />
            <TimerControls />
            <Timeline />
            <PeriodControls />
            <Stats />
            <DebuggingInfo />
        </>
    )
}
