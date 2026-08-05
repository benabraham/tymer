import { useEffect } from 'preact/hooks'
import { configPanelOpen } from '../../lib/period-configs'
import { Schedule } from '../../lib/schedule'
import { getNextMultipleOf3Delta } from '../../lib/snap'
import { cycleSoundSet } from '../../lib/sound-set'
import { toggleSound, unlockAudio } from '../../lib/sounds'
import {
    addPeriod,
    adjustableElapsed,
    adjustDuration,
    adjustElapsed,
    autoEditIndex,
    canAddPeriod,
    canAdjustDuration,
    canAdjustElapsed,
    canChangeType,
    canMoveElapsedToPrevious,
    canMoveToNextPeriod,
    canMoveToPreviousPeriod,
    canRemovePeriod,
    canStartPause,
    canTogglePin,
    changeType,
    closeDurationsPanel,
    currentPeriod,
    moveElapsedTimeToPreviousPeriod,
    moveToNextPeriod,
    moveToPreviousPeriod,
    openDurationsPanel,
    pauseTimer,
    removePeriod,
    resumeTimer,
    setCurrentPeriodType,
    startTimer,
    timerDurationElapsed,
    togglePinTimer,
} from '../../lib/timer'

export function KeyboardShortcuts() {
    useEffect(() => {
        const handleKeyDown = async (event: KeyboardEvent) => {
            // Escape closes the durations panel — handled before the isEditing
            // guard so it works while the live-editor textarea is focused.
            if (event.key === 'Escape') {
                if (configPanelOpen.value) {
                    event.preventDefault()
                    closeDurationsPanel()
                }
                return
            }

            // Ignore if user is editing or focused on interactive element
            // Element -> HTMLElement: only tagName/isContentEditable are read below,
            // both HTMLElement members; document.activeElement stays possibly-null.
            const activeElement = document.activeElement as HTMLElement | null
            const isEditing =
                activeElement?.tagName === 'INPUT'
                || activeElement?.tagName === 'TEXTAREA'
                || activeElement?.tagName === 'SELECT'
                || activeElement?.isContentEditable

            if (isEditing) return

            // If a button is focused and Enter is pressed, let the button handle it
            if (activeElement?.tagName === 'BUTTON' && event.key === 'Enter') return

            // Unlock audio on keyboard interaction
            await unlockAudio()

            // Space - toggle pause/run
            if (event.key === ' ') {
                event.preventDefault()
                if (canStartPause.value) {
                    if (Schedule.isRunning.value) pauseTimer()
                    else if (Schedule.isPaused.value) resumeTimer()
                    else startTimer()
                }
            }

            // PageDown - next period
            else if (event.key === 'PageDown') {
                event.preventDefault()
                if (canMoveToNextPeriod.value) {
                    moveToNextPeriod()
                }
            }

            // PageUp - previous period
            else if (event.key === 'PageUp') {
                event.preventDefault()
                if (canMoveToPreviousPeriod.value) {
                    moveToPreviousPeriod()
                }
            }

            // Arrow keys for elapsed time
            // Plain arrows: round to nearest multiple of 3
            else if (
                event.key === 'ArrowRight'
                && !event.ctrlKey
                && !event.altKey
                && !event.shiftKey
            ) {
                event.preventDefault()
                const delta = getNextMultipleOf3Delta({
                    currentMs: adjustableElapsed.value,
                    direction: 'up',
                })
                if (canAdjustElapsed(delta)) {
                    adjustElapsed(delta)
                }
            } else if (
                event.key === 'ArrowLeft'
                && !event.ctrlKey
                && !event.altKey
                && !event.shiftKey
            ) {
                event.preventDefault()
                const delta = getNextMultipleOf3Delta({
                    currentMs: adjustableElapsed.value,
                    direction: 'down',
                })
                if (canAdjustElapsed(delta)) {
                    adjustElapsed(delta)
                }
            }
            // Ctrl + arrows: ±6m
            else if (
                event.key === 'ArrowRight'
                && event.ctrlKey
                && !event.altKey
                && !event.shiftKey
            ) {
                event.preventDefault()
                if (canAdjustElapsed(6 * 60 * 1000)) {
                    adjustElapsed(6 * 60 * 1000)
                }
            } else if (
                event.key === 'ArrowLeft'
                && event.ctrlKey
                && !event.altKey
                && !event.shiftKey
            ) {
                event.preventDefault()
                if (canAdjustElapsed(-6 * 60 * 1000)) {
                    adjustElapsed(-6 * 60 * 1000)
                }
            }
            // Shift + arrows: ±24m
            else if (
                event.key === 'ArrowRight'
                && event.shiftKey
                && !event.altKey
                && !event.ctrlKey
            ) {
                event.preventDefault()
                if (canAdjustElapsed(24 * 60 * 1000)) {
                    adjustElapsed(24 * 60 * 1000)
                }
            } else if (
                event.key === 'ArrowLeft'
                && event.shiftKey
                && !event.altKey
                && !event.ctrlKey
            ) {
                event.preventDefault()
                if (canAdjustElapsed(-24 * 60 * 1000)) {
                    adjustElapsed(-24 * 60 * 1000)
                }
            }
            // Alt + arrows: ±1m
            else if (
                event.key === 'ArrowRight'
                && event.altKey
                && !event.shiftKey
                && !event.ctrlKey
            ) {
                event.preventDefault()
                if (canAdjustElapsed(1 * 60 * 1000)) {
                    adjustElapsed(1 * 60 * 1000)
                }
            } else if (
                event.key === 'ArrowLeft'
                && event.altKey
                && !event.shiftKey
                && !event.ctrlKey
            ) {
                event.preventDefault()
                if (canAdjustElapsed(-1 * 60 * 1000)) {
                    adjustElapsed(-1 * 60 * 1000)
                }
            }

            // Home - reset elapsed (🔙 button)
            else if (event.key === 'Home') {
                event.preventDefault()
                if (canAdjustElapsed(-timerDurationElapsed.value)) {
                    adjustElapsed(-timerDurationElapsed.value)
                }
            }

            // End - jump to end of current period
            else if (event.key === 'End') {
                event.preventDefault()
                // relative to the CURRENT period's elapsed — that is what
                // adjustElapsed moves, in both modes. The session total only
                // coincides with it on the first period.
                const currentDuration = currentPeriod.value?.state.duration || 0
                const delta = currentDuration - (currentPeriod.value?.state.elapsed || 0)
                if (canAdjustElapsed(delta)) {
                    adjustElapsed(delta)
                }
            }

            // +/= for duration
            // Plain +/-: round to nearest multiple of 3
            else if (
                (event.key === '+' || event.key === '=')
                && !event.ctrlKey
                && !event.altKey
                && !event.shiftKey
            ) {
                event.preventDefault()
                const currentDuration = currentPeriod.value?.state.duration || 0
                const delta = getNextMultipleOf3Delta({
                    currentMs: currentDuration,
                    direction: 'up',
                })
                if (canAdjustDuration(delta)) {
                    adjustDuration(delta)
                }
            } else if (event.key === '-' && !event.ctrlKey && !event.altKey && !event.shiftKey) {
                event.preventDefault()
                const currentDuration = currentPeriod.value?.state.duration || 0
                const delta = getNextMultipleOf3Delta({
                    currentMs: currentDuration,
                    direction: 'down',
                })
                if (canAdjustDuration(delta)) {
                    adjustDuration(delta)
                }
            }
            // Ctrl + +/-: ±6m
            else if (
                (event.key === '+' || event.key === '=')
                && event.ctrlKey
                && !event.altKey
                && !event.shiftKey
            ) {
                event.preventDefault()
                if (canAdjustDuration(6 * 60 * 1000)) {
                    adjustDuration(6 * 60 * 1000)
                }
            } else if (event.key === '-' && event.ctrlKey && !event.altKey && !event.shiftKey) {
                event.preventDefault()
                if (canAdjustDuration(-6 * 60 * 1000)) {
                    adjustDuration(-6 * 60 * 1000)
                }
            }
            // Shift + +/-: ±24m
            else if (
                (event.key === '+' || event.key === '=')
                && event.shiftKey
                && !event.altKey
                && !event.ctrlKey
            ) {
                event.preventDefault()
                if (canAdjustDuration(24 * 60 * 1000)) {
                    adjustDuration(24 * 60 * 1000)
                }
            } else if (event.key === '-' && event.shiftKey && !event.altKey && !event.ctrlKey) {
                event.preventDefault()
                if (canAdjustDuration(-24 * 60 * 1000)) {
                    adjustDuration(-24 * 60 * 1000)
                }
            }
            // Alt + +/-: ±1m
            else if (
                (event.key === '+' || event.key === '=')
                && event.altKey
                && !event.shiftKey
                && !event.ctrlKey
            ) {
                event.preventDefault()
                if (canAdjustDuration(1 * 60 * 1000)) {
                    adjustDuration(1 * 60 * 1000)
                }
            } else if (event.key === '-' && event.altKey && !event.shiftKey && !event.ctrlKey) {
                event.preventDefault()
                if (canAdjustDuration(-1 * 60 * 1000)) {
                    adjustDuration(-1 * 60 * 1000)
                }
            }

            // T - toggle type
            else if (
                (event.key === 't' || event.key === 'T')
                && !event.ctrlKey
                && !event.altKey
                && !event.shiftKey
            ) {
                event.preventDefault()
                if (canChangeType.value) {
                    changeType()
                }
            }

            // W - set type to work
            else if (
                (event.key === 'w' || event.key === 'W')
                && !event.ctrlKey
                && !event.altKey
                && !event.shiftKey
            ) {
                event.preventDefault()
                if (canChangeType.value) {
                    setCurrentPeriodType('work')
                }
            }

            // B - set type to break
            else if (
                (event.key === 'b' || event.key === 'B')
                && !event.ctrlKey
                && !event.altKey
                && !event.shiftKey
            ) {
                event.preventDefault()
                if (canChangeType.value) {
                    setCurrentPeriodType('break')
                }
            }

            // F - set type to fun
            else if (
                (event.key === 'f' || event.key === 'F')
                && !event.ctrlKey
                && !event.altKey
                && !event.shiftKey
            ) {
                event.preventDefault()
                if (canChangeType.value) {
                    setCurrentPeriodType('fun')
                }
            }

            // A - add period
            else if (
                (event.key === 'a' || event.key === 'A')
                && !event.ctrlKey
                && !event.altKey
                && !event.shiftKey
            ) {
                event.preventDefault()
                if (canAddPeriod.value) {
                    addPeriod()
                }
            }

            // P - toggle pin (anchored start)
            else if (
                (event.key === 'p' || event.key === 'P')
                && !event.ctrlKey
                && !event.altKey
                && !event.shiftKey
            ) {
                event.preventDefault()
                if (canTogglePin.value) {
                    togglePinTimer()
                }
            }

            // M - mute/unmute
            else if (
                (event.key === 'm' || event.key === 'M')
                && !event.ctrlKey
                && !event.altKey
                && !event.shiftKey
            ) {
                event.preventDefault()
                toggleSound()
            }

            // V - cycle voice set
            else if (
                (event.key === 'v' || event.key === 'V')
                && !event.ctrlKey
                && !event.altKey
                && !event.shiftKey
            ) {
                event.preventDefault()
                cycleSoundSet()
            }

            // E - open the durations panel (Edit current durations)
            else if (
                (event.key === 'e' || event.key === 'E')
                && !event.ctrlKey
                && !event.altKey
                && !event.shiftKey
            ) {
                event.preventDefault()
                if (!configPanelOpen.value) {
                    openDurationsPanel()
                }
            }

            // Backspace - move time to previous period
            else if (
                event.key === 'Backspace'
                && !event.ctrlKey
                && !event.altKey
                && !event.shiftKey
            ) {
                event.preventDefault()
                if (canMoveElapsedToPrevious.value) {
                    moveElapsedTimeToPreviousPeriod()
                }
            }

            // Enter - edit current period
            else if (event.key === 'Enter' && !event.ctrlKey && !event.altKey && !event.shiftKey) {
                event.preventDefault()
                if (Schedule.currentPeriodIndex.value !== null) {
                    autoEditIndex.value = Schedule.currentPeriodIndex.value
                }
            }

            // Insert - add period after current
            else if (event.key === 'Insert' && !event.ctrlKey && !event.altKey && !event.shiftKey) {
                event.preventDefault()
                if (canAddPeriod.value) {
                    addPeriod()
                }
            }

            // Delete - remove current period
            else if (event.key === 'Delete' && !event.ctrlKey && !event.altKey && !event.shiftKey) {
                event.preventDefault()
                if (canRemovePeriod.value) {
                    removePeriod()
                }
            }
        }

        document.addEventListener('keydown', handleKeyDown)

        return () => {
            document.removeEventListener('keydown', handleKeyDown)
        }
    }, [])

    return null
}
