import { useEffect } from 'preact/hooks'
import { initializeTimer, timerState, currentPeriod } from '../../lib/timer'
import { formatTime } from '../../lib/format'
import { unlockAudio } from '../../lib/sounds'
import { debugVisible } from '../../lib/debug'
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
                period.state.remaining < 60 * 60 * 1000 && period.state.duration < 60 * 60 * 1000

            let formattedPeriodDurationElapsed, periodUserIntendedDuration

            if (bothUnderOneHour) {
                // Show only minutes when both are under 60 minutes
                formattedPeriodDurationElapsed = Math.ceil(
                    period.state.elapsed / (60 * 1000),
                ).toString()
                periodUserIntendedDuration = Math.ceil(
                    period.config.userIntendedDuration / (60 * 1000),
                ).toString()
            } else {
                // Use full hours:minutes format
                formattedPeriodDurationElapsed = formatTime(period.state.elapsed, true, false)
                periodUserIntendedDuration = formatTime(
                    period.config.userIntendedDuration,
                    true,
                    false,
                )
            }

            const periodTypeInitial = period.config.type.charAt(0).toUpperCase()
            const isOvertime = period.state.elapsed > period.config.userIntendedDuration
            const overtimeIndicator = isOvertime ? '🛑 ' : ''
            document.title = `${periodTypeInitial} ${overtimeIndicator}${formattedPeriodDurationElapsed}/${periodUserIntendedDuration}`
        } else {
            document.title = 'Tymer'
        }
    }, [
        timerState.value.runningIntervalId,
        currentPeriod.value?.state.remaining,
        currentPeriod.value?.state.elapsed,
        currentPeriod.value?.config.userIntendedDuration,
        currentPeriod.value?.config.type,
    ])

    return (
        <>
            <KeyboardShortcuts />
            <BuildInfo />
            <TimerControls />
            <Timeline />
            <PeriodControls />
            <Stats />
            {debugVisible.value && <DebuggingInfo />}
        </>
    )
}
