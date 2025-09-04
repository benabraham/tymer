import { AVAILABLE_SOUNDS } from './sound-discovery'

export class SoundScheduler {
    constructor(windowSize = 2000, availableSounds = null) {
        this.WINDOW_SIZE = windowSize
        this.overlappingGroup = new Map() // Maps sound key to window object
        this.activeWindows = new Set() // Set of window keys currently active
        
        // Use provided sounds or default configuration
        this.availableSounds = availableSounds || AVAILABLE_SOUNDS
        
        // Calculate max remaining minutes for dynamic threshold
        this.maxRemainingMinutes = Math.max(...this.availableSounds.remaining)
    }
    
    // Calculate the threshold for switching from elapsed to remaining sounds
    getThreshold(intendedDuration) {
        // Dynamic threshold based on largest available remaining sound
        const remainingThreshold = intendedDuration - (this.maxRemainingMinutes * 60000)
        return Math.max(intendedDuration / 2, remainingThreshold)
    }
    
    // Get all possible sound windows for a given period
    getAllPossibleWindows(intendedDuration, periodType, nextPeriodType = null) {
        const windows = []
        
        // Add elapsed sound windows
        this.availableSounds.elapsed.forEach(minutes => {
            windows.push({
                type: 'elapsed',
                minutes,
                targetMs: minutes * 60000,
                soundPath: `sounds/elapsed/${String(minutes).padStart(3, '0')}.webm`,
                key: `elapsed_${minutes}`,
                priority: 1
            })
        })
        
        // Add remaining sound windows
        this.availableSounds.remaining.forEach(minutes => {
            const targetMs = intendedDuration - (minutes * 60000)
            if (targetMs >= 0) { // Only add if it makes sense for this duration
                windows.push({
                    type: 'remaining',
                    minutes,
                    targetMs,
                    soundPath: `sounds/remaining/${String(minutes).padStart(3, '0')}.webm`,
                    key: `remaining_${minutes}`,
                    priority: 2
                })
            }
        })
        
        // Add timesup window - sound based on next period type
        const timesupSoundType = nextPeriodType || 'finish'
        windows.push({
            type: 'timesup',
            targetMs: intendedDuration,
            soundPath: `sounds/timesup/${timesupSoundType}.webm`,
            key: 'timesup',
            priority: 4
        })
        
        // Add overtime windows
        const overtimeSounds = periodType === 'break' 
            ? this.availableSounds.overtimeBreak 
            : this.availableSounds.overtime
            
        overtimeSounds.forEach(minutes => {
            windows.push({
                type: 'overtime',
                minutes,
                targetMs: intendedDuration + (minutes * 60000),
                soundPath: periodType === 'break' 
                    ? `sounds/overtime/break/${String(minutes).padStart(3, '0')}.webm`
                    : `sounds/overtime/${String(minutes).padStart(3, '0')}.webm`,
                key: `overtime_${minutes}`,
                priority: 3
            })
        })
        
        return windows
    }
    
    // Get currently active windows based on elapsed time
    getActiveWindows(elapsedMs, intendedDuration, periodType, nextPeriodType = null) {
        const allWindows = this.getAllPossibleWindows(intendedDuration, periodType, nextPeriodType)
        const threshold = this.getThreshold(intendedDuration)
        const activeWindows = []
        
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
    checkSounds(elapsedMs, intendedDuration, periodType, isPaused, nextPeriodType = null) {
        if (isPaused) {
            this.clearState()
            return null
        }
        
        // Get all currently active windows
        const currentlyActive = this.getActiveWindows(elapsedMs, intendedDuration, periodType, nextPeriodType)
        const currentActiveKeys = new Set(currentlyActive.map(w => w.key))
        
        // Add any new windows to the overlapping group
        currentlyActive.forEach(window => {
            if (!this.activeWindows.has(window.key)) {
                // New window entered
                this.overlappingGroup.set(window.key, window)
            }
        })
        
        // Check if any windows from overlapping group have ended
        const stillActiveInGroup = []
        const endedWindows = []
        
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
            const threshold = this.getThreshold(intendedDuration)
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
    selectHighestPriority(windows) {
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
    _isInWindow(targetMs, currentMs) {
        return Math.abs(currentMs - targetMs) <= this.WINDOW_SIZE
    }
    
    // State management methods
    onPeriodChange() {
        this.clearState()
    }
    
    onDurationChange() {
        this.clearState()
    }
    
    onElapsedAdjustment(newElapsed, oldElapsed) {
        // Clear state when going backwards in time
        if (newElapsed < oldElapsed) {
            this.clearState()
        }
    }
    
    clearState() {
        this.overlappingGroup.clear()
        this.activeWindows.clear()
    }
}