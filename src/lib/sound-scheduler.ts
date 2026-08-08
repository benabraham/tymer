import type { PeriodType } from './period.js'
import type { AvailableSounds } from './sound-discovery'
import { AVAILABLE_SOUNDS } from './sound-discovery'

type SoundWindowType = 'elapsed' | 'remaining' | 'timesup' | 'overtime'

export type SoundWindow = {
    type: SoundWindowType
    minutes?: number
    targetMs: number
    key: string
    priority: number
}

export class SoundScheduler {
    WINDOW_SIZE: number
    overlappingGroup: Map<string, SoundWindow> // Maps sound key to window object
    activeWindows: Set<string> // Set of window keys currently active
    availableSounds: AvailableSounds
    maxRemainingMinutes: number
    maxRemainingBreakMinutes: number

    constructor(windowSize: number = 2000, availableSounds: AvailableSounds | null = null) {
        this.WINDOW_SIZE = windowSize
        this.overlappingGroup = new Map()
        this.activeWindows = new Set()

        // Use provided sounds or default configuration
        this.availableSounds = availableSounds || AVAILABLE_SOUNDS

        // Calculate max remaining minutes for dynamic threshold
        this.maxRemainingMinutes = Math.max(...this.availableSounds.remaining)
        this.maxRemainingBreakMinutes = Math.max(...this.availableSounds.remainingBreak)
    }

    // Calculate the threshold for switching from elapsed to remaining sounds.
    // Break periods use the break remaining bank (max 12 min) instead of the
    // work/fun bank (max 24 min) — their remaining windows top out earlier.
    getThreshold(intendedDuration: number, periodType: PeriodType = 'work'): number {
        const maxRemaining =
            periodType === 'break' ? this.maxRemainingBreakMinutes : this.maxRemainingMinutes
        const remainingThreshold = intendedDuration - maxRemaining * 60000
        return Math.max(intendedDuration / 2, remainingThreshold)
    }

    // Get all possible sound windows for a given period
    getAllPossibleWindows(
        intendedDuration: number,
        periodType: PeriodType,
        nextPeriodType: PeriodType | 'finish' | null = null,
    ): SoundWindow[] {
        const windows: SoundWindow[] = []
        const isBreak = periodType === 'break'

        // Add elapsed sound windows — break periods use the break-specific
        // bank (elapsed/break/…) with elapsed_break_N keys; work/fun keep
        // the original bank and keys.
        const elapsedMinutes = isBreak
            ? this.availableSounds.elapsedBreak
            : this.availableSounds.elapsed
        elapsedMinutes.forEach(minutes => {
            windows.push({
                type: 'elapsed',
                minutes,
                targetMs: minutes * 60000,
                key: isBreak ? `elapsed_break_${minutes}` : `elapsed_${minutes}`,
                priority: 1,
            })
        })

        // Add remaining sound windows — break periods use the break-specific
        // bank (remaining/break/…) with remaining_break_N keys. The 12-minute
        // break warning only makes sense for breaks long enough to still be
        // running at the 48-minute mark — an explicit, non-derivable gate.
        const remainingMinutes = isBreak
            ? this.availableSounds.remainingBreak
            : this.availableSounds.remaining
        remainingMinutes.forEach(minutes => {
            if (isBreak && minutes === 12 && intendedDuration < 48 * 60000) return

            const targetMs = intendedDuration - minutes * 60000
            if (targetMs >= 0) {
                // Only add if it makes sense for this duration
                windows.push({
                    type: 'remaining',
                    minutes,
                    targetMs,
                    key: isBreak ? `remaining_break_${minutes}` : `remaining_${minutes}`,
                    priority: 2,
                })
            }
        })

        // Add timesup window - sound based on next period type. Key is the
        // canonical manifest key so callers can play it directly.
        const timesupSoundType = nextPeriodType || 'finish'
        windows.push({
            type: 'timesup',
            targetMs: intendedDuration,
            key: `timesup_${timesupSoundType}`,
            priority: 4,
        })

        // Add overtime windows
        const overtimeSounds =
            periodType === 'break'
                ? this.availableSounds.overtimeBreak
                : this.availableSounds.overtime

        overtimeSounds.forEach(minutes => {
            windows.push({
                type: 'overtime',
                minutes,
                targetMs: intendedDuration + minutes * 60000,
                key: isBreak ? `overtime_break_${minutes}` : `overtime_${minutes}`,
                priority: 3,
            })
        })

        return windows
    }

    // Get currently active windows based on elapsed time
    getActiveWindows(
        elapsedMs: number,
        intendedDuration: number,
        periodType: PeriodType,
        nextPeriodType: PeriodType | 'finish' | null = null,
    ): SoundWindow[] {
        const allWindows = this.getAllPossibleWindows(intendedDuration, periodType, nextPeriodType)
        const activeWindows: SoundWindow[] = []

        for (const window of allWindows) {
            // Check if we're in this window
            if (!this._isInWindow(window.targetMs, elapsedMs)) {
                continue
            }

            // No entry-time filtering - all threshold logic handled at trigger time

            activeWindows.push(window)
        }

        return activeWindows
    }

    // Main function to check what sound should play
    checkSounds(
        elapsedMs: number,
        intendedDuration: number,
        periodType: PeriodType,
        isPaused: boolean,
        nextPeriodType: PeriodType | 'finish' | null = null,
    ): SoundWindow | null {
        if (isPaused) {
            this.clearState()
            return null
        }

        // Get all currently active windows
        const currentlyActive = this.getActiveWindows(
            elapsedMs,
            intendedDuration,
            periodType,
            nextPeriodType,
        )
        const currentActiveKeys = new Set(currentlyActive.map(w => w.key))

        // Add any new windows to the overlapping group
        currentlyActive.forEach(window => {
            if (!this.activeWindows.has(window.key)) {
                // New window entered
                this.overlappingGroup.set(window.key, window)
            }
        })

        // Check if any windows from overlapping group have ended
        const stillActiveInGroup: SoundWindow[] = []
        const endedWindows: SoundWindow[] = []

        for (const [key, window] of this.overlappingGroup) {
            if (currentActiveKeys.has(key)) {
                stillActiveInGroup.push(window)
            } else {
                endedWindows.push(window)
            }
        }

        // Only trigger when ALL overlapping windows have ended
        if (this.overlappingGroup.size > 0 && stillActiveInGroup.length === 0) {
            // All windows in the group have ended - filter by threshold at trigger time
            const threshold = this.getThreshold(intendedDuration, periodType)
            const candidateWindows = Array.from(this.overlappingGroup.values()).filter(window => {
                // Apply threshold rules at trigger time (not entry time)
                if (window.type === 'elapsed' && elapsedMs >= threshold) {
                    return false // Skip elapsed sounds at/after threshold
                }
                if (window.type === 'remaining' && elapsedMs < threshold) {
                    return false // Skip remaining sounds before threshold
                }
                return true
            })

            const winner = this.selectHighestPriority(candidateWindows)
            this.overlappingGroup.clear()
            this.activeWindows = currentActiveKeys
            return winner
        }

        // Update active windows tracking
        this.activeWindows = currentActiveKeys
        return null
    }

    // Select the highest priority sound from competing windows
    selectHighestPriority(windows: SoundWindow[]): SoundWindow | null {
        if (windows.length === 0) return null

        // Create a copy to avoid mutating the original array
        const sortedWindows = [...windows]

        // Sort by priority (highest first), then by target time
        sortedWindows.sort((a, b) => {
            if (a.priority !== b.priority) {
                return b.priority - a.priority // Higher priority first
            }
            return a.targetMs - b.targetMs // Earlier time first
        })

        return sortedWindows[0]
    }

    // Check if a given time is within a window
    _isInWindow(targetMs: number, currentMs: number): boolean {
        return Math.abs(currentMs - targetMs) <= this.WINDOW_SIZE
    }

    // State management methods
    onPeriodChange(): void {
        this.clearState()
    }

    onDurationChange(): void {
        this.clearState()
    }

    onElapsedAdjustment(newElapsed: number, oldElapsed: number): void {
        // Clear state when going backwards in time
        if (newElapsed < oldElapsed) {
            this.clearState()
        }
    }

    clearState(): void {
        this.overlappingGroup.clear()
        this.activeWindows.clear()
    }
}
