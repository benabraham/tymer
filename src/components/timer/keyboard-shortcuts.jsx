import { useEffect } from 'preact/hooks'
import {
    timerState,
    pauseTimer,
    resumeTimer,
    startTimer,
    moveToNextPeriod,
    moveToPreviousPeriod,
    adjustElapsed,
    adjustDuration,
    timerDurationElapsed,
    currentPeriod,
    changeType,
    addPeriod,
    moveElapsedTimeToPreviousPeriod,
    autoEditIndex,
    canStartPause,
    canMoveToNextPeriod,
    canMoveToPreviousPeriod,
    canAdjustElapsed,
    canAdjustDuration,
    canChangeType,
    canAddPeriod,
    canMoveElapsedToPrevious,
    getNextMultipleOf3Delta,
} from '../../lib/timer'
import { unlockAudio } from '../../lib/sounds'

export function KeyboardShortcuts() {
    useEffect(() => {
        const handleKeyDown = async event => {
            // Ignore if user is editing
            const activeElement = document.activeElement
            const isEditing =
                activeElement?.tagName === 'INPUT' ||
                activeElement?.tagName === 'TEXTAREA' ||
                activeElement?.tagName === 'SELECT' ||
                activeElement?.isContentEditable

            if (isEditing) return

            // Unlock audio on keyboard interaction
            await unlockAudio()

            let handled = false

            // Space - toggle pause/run
            if (event.key === ' ') {
                event.preventDefault()
                if (canStartPause.value) {
                    if (timerState.value.runningIntervalId) pauseTimer()
                    else if (timerState.value.timestampPaused) resumeTimer()
                    else startTimer()
                    handled = true
                }
            }

            // PageDown - next period
            else if (event.key === 'PageDown') {
                event.preventDefault()
                if (canMoveToNextPeriod.value) {
                    moveToNextPeriod()
                    handled = true
                }
            }

            // PageUp - previous period
            else if (event.key === 'PageUp') {
                event.preventDefault()
                if (canMoveToPreviousPeriod.value) {
                    moveToPreviousPeriod()
                    handled = true
                }
            }

            // Arrow keys for elapsed time
            // Plain arrows: round to nearest multiple of 3
            else if (event.key === 'ArrowRight' && !event.ctrlKey && !event.altKey && !event.shiftKey) {
                event.preventDefault()
                const delta = getNextMultipleOf3Delta(timerDurationElapsed.value, 'up')
                if (canAdjustElapsed(delta)) {
                    adjustElapsed(delta)
                    handled = true
                }
            } else if (event.key === 'ArrowLeft' && !event.ctrlKey && !event.altKey && !event.shiftKey) {
                event.preventDefault()
                const delta = getNextMultipleOf3Delta(timerDurationElapsed.value, 'down')
                if (canAdjustElapsed(delta)) {
                    adjustElapsed(delta)
                    handled = true
                }
            }
            // Ctrl + arrows: ±6m
            else if (event.key === 'ArrowRight' && event.ctrlKey && !event.altKey && !event.shiftKey) {
                event.preventDefault()
                if (canAdjustElapsed(6 * 60 * 1000)) {
                    adjustElapsed(6 * 60 * 1000)
                    handled = true
                }
            } else if (event.key === 'ArrowLeft' && event.ctrlKey && !event.altKey && !event.shiftKey) {
                event.preventDefault()
                if (canAdjustElapsed(-6 * 60 * 1000)) {
                    adjustElapsed(-6 * 60 * 1000)
                    handled = true
                }
            }
            // Shift + arrows: ±24m
            else if (event.key === 'ArrowRight' && event.shiftKey && !event.altKey && !event.ctrlKey) {
                event.preventDefault()
                if (canAdjustElapsed(24 * 60 * 1000)) {
                    adjustElapsed(24 * 60 * 1000)
                    handled = true
                }
            } else if (event.key === 'ArrowLeft' && event.shiftKey && !event.altKey && !event.ctrlKey) {
                event.preventDefault()
                if (canAdjustElapsed(-24 * 60 * 1000)) {
                    adjustElapsed(-24 * 60 * 1000)
                    handled = true
                }
            }
            // Alt + arrows: ±1m
            else if (event.key === 'ArrowRight' && event.altKey && !event.shiftKey && !event.ctrlKey) {
                event.preventDefault()
                if (canAdjustElapsed(1 * 60 * 1000)) {
                    adjustElapsed(1 * 60 * 1000)
                    handled = true
                }
            } else if (event.key === 'ArrowLeft' && event.altKey && !event.shiftKey && !event.ctrlKey) {
                event.preventDefault()
                if (canAdjustElapsed(-1 * 60 * 1000)) {
                    adjustElapsed(-1 * 60 * 1000)
                    handled = true
                }
            }

            // Home - reset elapsed (🔙 button)
            else if (event.key === 'Home') {
                event.preventDefault()
                if (canAdjustElapsed(-timerDurationElapsed.value)) {
                    adjustElapsed(-timerDurationElapsed.value)
                    handled = true
                }
            }

            // End - jump to end of current period
            else if (event.key === 'End') {
                event.preventDefault()
                const currentDuration = currentPeriod.value?.periodDuration || 0
                const delta = currentDuration - timerDurationElapsed.value
                if (canAdjustElapsed(delta)) {
                    adjustElapsed(delta)
                    handled = true
                }
            }

            // +/= for duration
            // Plain +/-: round to nearest multiple of 3
            else if ((event.key === '+' || event.key === '=') && !event.ctrlKey && !event.altKey && !event.shiftKey) {
                event.preventDefault()
                const currentDuration = currentPeriod.value?.periodDuration || 0
                const delta = getNextMultipleOf3Delta(currentDuration, 'up')
                if (canAdjustDuration(delta)) {
                    adjustDuration(delta)
                    handled = true
                }
            } else if (event.key === '-' && !event.ctrlKey && !event.altKey && !event.shiftKey) {
                event.preventDefault()
                const currentDuration = currentPeriod.value?.periodDuration || 0
                const delta = getNextMultipleOf3Delta(currentDuration, 'down')
                if (canAdjustDuration(delta)) {
                    adjustDuration(delta)
                    handled = true
                }
            }
            // Ctrl + +/-: ±6m
            else if ((event.key === '+' || event.key === '=') && event.ctrlKey && !event.altKey && !event.shiftKey) {
                event.preventDefault()
                if (canAdjustDuration(6 * 60 * 1000)) {
                    adjustDuration(6 * 60 * 1000)
                    handled = true
                }
            } else if (event.key === '-' && event.ctrlKey && !event.altKey && !event.shiftKey) {
                event.preventDefault()
                if (canAdjustDuration(-6 * 60 * 1000)) {
                    adjustDuration(-6 * 60 * 1000)
                    handled = true
                }
            }
            // Shift + +/-: ±24m
            else if ((event.key === '+' || event.key === '=') && event.shiftKey && !event.altKey && !event.ctrlKey) {
                event.preventDefault()
                if (canAdjustDuration(24 * 60 * 1000)) {
                    adjustDuration(24 * 60 * 1000)
                    handled = true
                }
            } else if (event.key === '-' && event.shiftKey && !event.altKey && !event.ctrlKey) {
                event.preventDefault()
                if (canAdjustDuration(-24 * 60 * 1000)) {
                    adjustDuration(-24 * 60 * 1000)
                    handled = true
                }
            }
            // Alt + +/-: ±1m
            else if ((event.key === '+' || event.key === '=') && event.altKey && !event.shiftKey && !event.ctrlKey) {
                event.preventDefault()
                if (canAdjustDuration(1 * 60 * 1000)) {
                    adjustDuration(1 * 60 * 1000)
                    handled = true
                }
            } else if (event.key === '-' && event.altKey && !event.shiftKey && !event.ctrlKey) {
                event.preventDefault()
                if (canAdjustDuration(-1 * 60 * 1000)) {
                    adjustDuration(-1 * 60 * 1000)
                    handled = true
                }
            }

            // T - toggle type
            else if ((event.key === 't' || event.key === 'T') && !event.ctrlKey && !event.altKey && !event.shiftKey) {
                event.preventDefault()
                if (canChangeType.value) {
                    changeType()
                    handled = true
                }
            }

            // A - add period
            else if ((event.key === 'a' || event.key === 'A') && !event.ctrlKey && !event.altKey && !event.shiftKey) {
                event.preventDefault()
                if (canAddPeriod.value) {
                    addPeriod()
                    handled = true
                }
            }

            // Backspace - move time to previous period
            else if (event.key === 'Backspace' && !event.ctrlKey && !event.altKey && !event.shiftKey) {
                event.preventDefault()
                if (canMoveElapsedToPrevious.value) {
                    moveElapsedTimeToPreviousPeriod()
                    handled = true
                }
            }

            // Enter - edit current period
            else if (event.key === 'Enter' && !event.ctrlKey && !event.altKey && !event.shiftKey) {
                event.preventDefault()
                if (timerState.value.currentPeriodIndex !== null) {
                    autoEditIndex.value = timerState.value.currentPeriodIndex
                    handled = true
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
