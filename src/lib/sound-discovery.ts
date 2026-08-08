// Configuration for available sounds in the system
// This can be dynamically loaded or discovered from the file system

export type AvailableSounds = {
    elapsed: number[]
    remaining: number[]
    overtime: number[]
    overtimeBreak: number[]
    elapsedBreak: number[]
    remainingBreak: number[]
}

export const AVAILABLE_SOUNDS: AvailableSounds = {
    // Elapsed time announcements (in minutes)
    elapsed: [6, 12, 24, 36, 48, 60, 72, 84, 96, 108],

    // Remaining time warnings (in minutes before end)
    remaining: [6, 12, 24],

    // Overtime announcements (in minutes past intended duration)
    overtime: [6, 12, 18, 24, 30, 36, 42, 48],

    // Break-specific overtime announcements
    overtimeBreak: [6, 12, 18, 24, 30, 36, 42, 48],

    // Break-specific elapsed time announcements
    elapsedBreak: [6, 12],

    // Break-specific remaining time warnings
    remainingBreak: [6, 12],
}

// Minutes before a deadline at which a spoken warning plays.
export const DEADLINE_WARNING_MINUTES: number[] = [60, 12, 6]

// Helper to get the maximum remaining sound available
export const getMaxRemainingMinutes = (): number => Math.max(...AVAILABLE_SOUNDS.remaining)

// Helper to discover sounds (future enhancement)
export const discoverAvailableSounds = (): AvailableSounds => {
    // In a real implementation, this could scan the file system
    // or load from a configuration file
    // For now, return the static configuration
    return AVAILABLE_SOUNDS
}
