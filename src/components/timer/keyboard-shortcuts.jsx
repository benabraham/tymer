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
    timerDurationRemaining,
    timerHasFinished,
    timerOnLastPeriod,
    currentPeriod,
    changeType,
    addPeriod,
    moveElapsedTimeToPreviousPeriod,
} from '../../lib/timer'
import { playSound, unlockAudio } from '../../lib/sounds'

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
                const isDisabled = timerHasFinished.value || !timerDurationRemaining.value
                if (!isDisabled) {
                    if (timerState.value.runningIntervalId) pauseTimer()
                    else if (timerState.value.timestampPaused) resumeTimer()
                    else startTimer()
                    handled = true
                }
            }

            // PageUp - next period
            else if (event.key === 'PageUp') {
                event.preventDefault()
                const isDisabled =
                    timerHasFinished.value ||
                    timerState.value.currentPeriodIndex === null ||
                    timerOnLastPeriod.value
                if (!isDisabled) {
                    moveToNextPeriod()
                    handled = true
                }
            }

            // PageDown - previous period
            else if (event.key === 'PageDown') {
                event.preventDefault()
                const isDisabled =
                    timerHasFinished.value ||
                    timerState.value.currentPeriodIndex === null ||
                    timerState.value.currentPeriodIndex === 0
                if (!isDisabled) {
                    moveToPreviousPeriod()
                    handled = true
                }
            }

            // Arrow keys for elapsed time
            // Plain arrows: round to nearest multiple of 3
            else if (event.key === 'ArrowRight' && !event.ctrlKey && !event.altKey && !event.shiftKey) {
                event.preventDefault()
                const isDisabled = timerState.value.currentPeriodIndex === null
                if (!isDisabled) {
                    const currentMinutes = Math.floor(timerDurationElapsed.value / (60 * 1000))
                    const nextMultipleOf3 = Math.ceil((currentMinutes + 1) / 3) * 3
                    const delta = (nextMultipleOf3 - currentMinutes) * 60 * 1000
                    adjustElapsed(delta)
                    handled = true
                }
            } else if (event.key === 'ArrowLeft' && !event.ctrlKey && !event.altKey && !event.shiftKey) {
                event.preventDefault()
                const isDisabled = timerState.value.currentPeriodIndex === null || timerDurationElapsed.value === 0
                if (!isDisabled) {
                    const currentMinutes = Math.floor(timerDurationElapsed.value / (60 * 1000))
                    const prevMultipleOf3 = Math.floor((currentMinutes - 1) / 3) * 3
                    const delta = (prevMultipleOf3 - currentMinutes) * 60 * 1000
                    adjustElapsed(delta)
                    handled = true
                }
            }
            // Ctrl + arrows: ±6m
            else if (event.key === 'ArrowRight' && event.ctrlKey && !event.altKey && !event.shiftKey) {
                event.preventDefault()
                const isDisabled = timerState.value.currentPeriodIndex === null
                if (!isDisabled) {
                    adjustElapsed(6 * 60 * 1000) // +6m
                    handled = true
                }
            } else if (event.key === 'ArrowLeft' && event.ctrlKey && !event.altKey && !event.shiftKey) {
                event.preventDefault()
                const isDisabled = timerState.value.currentPeriodIndex === null || timerDurationElapsed.value === 0
                if (!isDisabled) {
                    adjustElapsed(-6 * 60 * 1000) // -6m
                    handled = true
                }
            }
            // Shift + arrows: ±24m
            else if (event.key === 'ArrowRight' && event.shiftKey && !event.altKey && !event.ctrlKey) {
                event.preventDefault()
                const isDisabled = timerState.value.currentPeriodIndex === null
                if (!isDisabled) {
                    adjustElapsed(24 * 60 * 1000) // +24m
                    handled = true
                }
            } else if (event.key === 'ArrowLeft' && event.shiftKey && !event.altKey && !event.ctrlKey) {
                event.preventDefault()
                const isDisabled = timerState.value.currentPeriodIndex === null || timerDurationElapsed.value === 0
                if (!isDisabled) {
                    adjustElapsed(-24 * 60 * 1000) // -24m
                    handled = true
                }
            }
            // Alt + arrows: ±1m
            else if (event.key === 'ArrowRight' && event.altKey && !event.shiftKey && !event.ctrlKey) {
                event.preventDefault()
                const isDisabled = timerState.value.currentPeriodIndex === null
                if (!isDisabled) {
                    adjustElapsed(1 * 60 * 1000) // +1m
                    handled = true
                }
            } else if (event.key === 'ArrowLeft' && event.altKey && !event.shiftKey && !event.ctrlKey) {
                event.preventDefault()
                const isDisabled = timerState.value.currentPeriodIndex === null || timerDurationElapsed.value === 0
                if (!isDisabled) {
                    adjustElapsed(-1 * 60 * 1000) // -1m
                    handled = true
                }
            }

            // Home - reset elapsed (🔙 button)
            else if (event.key === 'Home') {
                event.preventDefault()
                const isDisabled = timerState.value.currentPeriodIndex === null || timerDurationElapsed.value === 0
                if (!isDisabled) {
                    adjustElapsed(-timerDurationElapsed.value)
                    handled = true
                }
            }

            // +/= for duration
            // Plain +/-: round to nearest multiple of 3
            else if ((event.key === '+' || event.key === '=') && !event.ctrlKey && !event.altKey && !event.shiftKey) {
                event.preventDefault()
                const isDisabled = timerHasFinished.value || timerState.value.currentPeriodIndex === null
                if (!isDisabled) {
                    const currentDuration = currentPeriod.value?.periodDuration || 0
                    const currentMinutes = Math.floor(currentDuration / (60 * 1000))
                    const nextMultipleOf3 = Math.ceil((currentMinutes + 1) / 3) * 3
                    const delta = (nextMultipleOf3 - currentMinutes) * 60 * 1000
                    adjustDuration(delta)
                    handled = true
                }
            } else if (event.key === '-' && !event.ctrlKey && !event.altKey && !event.shiftKey) {
                event.preventDefault()
                const currentDuration = currentPeriod.value?.periodDuration || 0
                const currentMinutes = Math.floor(currentDuration / (60 * 1000))
                const prevMultipleOf3 = Math.floor((currentMinutes - 1) / 3) * 3
                const delta = (prevMultipleOf3 - currentMinutes) * 60 * 1000
                const isDisabled =
                    timerHasFinished.value ||
                    timerState.value.currentPeriodIndex === null ||
                    !timerState.value.periods.some(p => p.periodDurationRemaining > 0) ||
                    currentPeriod.value.periodDurationRemaining < Math.abs(delta)
                if (!isDisabled) {
                    adjustDuration(delta)
                    handled = true
                }
            }
            // Ctrl + +/-: ±6m
            else if ((event.key === '+' || event.key === '=') && event.ctrlKey && !event.altKey && !event.shiftKey) {
                event.preventDefault()
                const isDisabled = timerHasFinished.value || timerState.value.currentPeriodIndex === null
                if (!isDisabled) {
                    adjustDuration(6 * 60 * 1000) // +6m
                    handled = true
                }
            } else if (event.key === '-' && event.ctrlKey && !event.altKey && !event.shiftKey) {
                event.preventDefault()
                const isDisabled =
                    timerHasFinished.value ||
                    timerState.value.currentPeriodIndex === null ||
                    !timerState.value.periods.some(p => p.periodDurationRemaining > 0) ||
                    currentPeriod.value.periodDurationRemaining < 6 * 60 * 1000
                if (!isDisabled) {
                    adjustDuration(-6 * 60 * 1000) // -6m
                    handled = true
                }
            }
            // Shift + +/-: ±24m
            else if ((event.key === '+' || event.key === '=') && event.shiftKey && !event.altKey && !event.ctrlKey) {
                event.preventDefault()
                const isDisabled = timerHasFinished.value || timerState.value.currentPeriodIndex === null
                if (!isDisabled) {
                    adjustDuration(24 * 60 * 1000) // +24m
                    handled = true
                }
            } else if (event.key === '-' && event.shiftKey && !event.altKey && !event.ctrlKey) {
                event.preventDefault()
                const isDisabled =
                    timerHasFinished.value ||
                    timerState.value.currentPeriodIndex === null ||
                    !timerState.value.periods.some(p => p.periodDurationRemaining > 0) ||
                    currentPeriod.value.periodDurationRemaining < 24 * 60 * 1000
                if (!isDisabled) {
                    adjustDuration(-24 * 60 * 1000) // -24m
                    handled = true
                }
            }
            // Alt + +/-: ±1m
            else if ((event.key === '+' || event.key === '=') && event.altKey && !event.shiftKey && !event.ctrlKey) {
                event.preventDefault()
                const isDisabled = timerHasFinished.value || timerState.value.currentPeriodIndex === null
                if (!isDisabled) {
                    adjustDuration(1 * 60 * 1000) // +1m
                    handled = true
                }
            } else if (event.key === '-' && event.altKey && !event.shiftKey && !event.ctrlKey) {
                event.preventDefault()
                const isDisabled =
                    timerHasFinished.value ||
                    timerState.value.currentPeriodIndex === null ||
                    !timerState.value.periods.some(p => p.periodDurationRemaining > 0) ||
                    currentPeriod.value.periodDurationRemaining < 1 * 60 * 1000
                if (!isDisabled) {
                    adjustDuration(-1 * 60 * 1000) // -1m
                    handled = true
                }
            }

            // T - toggle type
            else if ((event.key === 't' || event.key === 'T') && !event.ctrlKey && !event.altKey && !event.shiftKey) {
                event.preventDefault()
                const isDisabled = timerState.value.currentPeriodIndex === null
                if (!isDisabled) {
                    changeType()
                    handled = true
                }
            }

            // A - add period
            else if ((event.key === 'a' || event.key === 'A') && !event.ctrlKey && !event.altKey && !event.shiftKey) {
                event.preventDefault()
                const isDisabled = timerState.value.currentPeriodIndex === null
                if (!isDisabled) {
                    addPeriod()
                    handled = true
                }
            }

            // Backspace - move time to previous period
            else if (event.key === 'Backspace' && !event.ctrlKey && !event.altKey && !event.shiftKey) {
                event.preventDefault()
                const isDisabled =
                    timerState.value.currentPeriodIndex === null ||
                    timerDurationElapsed.value === 0 ||
                    timerState.value.currentPeriodIndex === 0
                if (!isDisabled) {
                    moveElapsedTimeToPreviousPeriod()
                    handled = true
                }
            }

            // Play sound feedback if action was handled
            if (handled) {
                await playSound('button')
            }
        }

        document.addEventListener('keydown', handleKeyDown)

        return () => {
            document.removeEventListener('keydown', handleKeyDown)
        }
    }, [])

    return null
}
