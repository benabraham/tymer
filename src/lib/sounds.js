import { Howl, Howler } from 'howler'
import { COLLECTION_WINDOW } from './config.js'

// Audio context unlock state
let audioUnlocked = false
let audioContextKeepAlive = null

// Function to unlock audio context on user interaction
export const unlockAudio = async () => {
    if (audioUnlocked) return true

    try {
        // Try to unlock by creating and playing a silent sound
        const unlockSound = new Howl({
            src: [
                'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=',
            ],
            volume: 0,
            html5: false,
        })

        const playPromise = unlockSound.play()
        if (playPromise) {
            await playPromise
        }

        audioUnlocked = true
        console.log('🔊 Audio context unlocked successfully')
        
        // Keep audio context alive for PWA
        startAudioContextKeepAlive()
        
        return true
    } catch (error) {
        console.warn('Failed to unlock audio context:', error)
        return false
    }
}

// Keep audio context alive with periodic silent sounds (PWA optimization)
const startAudioContextKeepAlive = () => {
    if (audioContextKeepAlive) return // Already running
    
    const keepAliveSilentSound = new Howl({
        src: [
            'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=',
        ],
        volume: 0,
        html5: false,
    })
    
    // Play silent sound every 30 seconds to keep context alive
    audioContextKeepAlive = setInterval(() => {
        if (document.visibilityState === 'visible') {
            keepAliveSilentSound.play()
        }
    }, 30000)
    
    // Handle visibility changes for PWA
    const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible' && audioUnlocked) {
            // Re-activate audio context when app becomes visible
            keepAliveSilentSound.play()
        }
    }
    
    document.addEventListener('visibilitychange', handleVisibilityChange)
}

// Sound configuration - paths organized by notification type
export const soundConfig = {
    // General sounds
    general: {
        button: '/tymer/sounds/button.webm',
        timerFinished: '/tymer/sounds/timer-end.webm',
    },

    // Set 1: Elapsed time announcements (every 12 minutes)
    elapsed: {
        12: '/tymer/sounds/elapsed/012.webm',
        24: '/tymer/sounds/elapsed/024.webm',
        36: '/tymer/sounds/elapsed/036.webm',
        48: '/tymer/sounds/elapsed/048.webm',
        60: '/tymer/sounds/elapsed/060.webm',
        72: '/tymer/sounds/elapsed/072.webm',
        84: '/tymer/sounds/elapsed/084.webm',
        96: '/tymer/sounds/elapsed/096.webm',
        108: '/tymer/sounds/elapsed/108.webm',
    },

    // Set 2: Remaining time warnings (24, 12, and 6 minutes before end)
    remaining: {
        24: '/tymer/sounds/remaining/024.webm',
        12: '/tymer/sounds/remaining/012.webm',
        6: '/tymer/sounds/remaining/006.webm',
    },

    // Set 3: Period end announcements (based on next period type)
    periodEnd: {
        work: '/tymer/sounds/timesup/work.webm',
        break: '/tymer/sounds/timesup/break.webm',
        fun: '/tymer/sounds/timesup/fun.webm',
    },

    // Set 4: Overtime announcements (every 6 minutes + hour milestone)
    overtime: {
        6: '/tymer/sounds/overtime/006.webm',
        12: '/tymer/sounds/overtime/012.webm',
        18: '/tymer/sounds/overtime/018.webm',
        24: '/tymer/sounds/overtime/024.webm',
        30: '/tymer/sounds/overtime/030.webm',
        36: '/tymer/sounds/overtime/036.webm',
        42: '/tymer/sounds/overtime/042.webm',
        48: '/tymer/sounds/overtime/048.webm',
        60: '/tymer/sounds/overtime/060.webm',
    },

    // Set 5: Break overtime announcements (same intervals, different sounds)
    overtimeBreak: {
        6: '/tymer/sounds/overtime/break/006.webm',
        12: '/tymer/sounds/overtime/break/012.webm',
        18: '/tymer/sounds/overtime/break/018.webm',
        24: '/tymer/sounds/overtime/break/024.webm',
        30: '/tymer/sounds/overtime/break/030.webm',
        36: '/tymer/sounds/overtime/break/036.webm',
        42: '/tymer/sounds/overtime/break/042.webm',
        48: '/tymer/sounds/overtime/break/048.webm',
        60: '/tymer/sounds/overtime/break/060.webm',
    },
}

// Create Howl instances from the configuration
const sounds = Object.fromEntries(
    Object.entries(soundConfig).map(([setName, setConfig]) => [
        setName,
        Object.fromEntries(
            Object.entries(setConfig).map(([key, path]) => [
                key,
                new Howl({ src: [path], loop: false }),
            ]),
        ),
    ]),
)

// Get sound configuration intervals from config keys
const getElapsedIntervals = () => {
    return Object.keys(soundConfig.elapsed).map(Number).sort((a, b) => a - b)
}

const getRemainingIntervals = () => {
    return Object.keys(soundConfig.remaining).map(Number).sort((a, b) => a - b)
}

const getOvertimeIntervals = (periodType = 'work') => {
    const configKey = periodType === 'break' ? 'overtimeBreak' : 'overtime'
    const allKeys = Object.keys(soundConfig[configKey]).map(Number).sort((a, b) => a - b)
    // Return all keys except the last one (which is used for looping)
    return allKeys.slice(0, -1)
}

// Get the last overtime sound configuration for looping
const getLastOvertimeConfig = (periodType = 'work') => {
    const configKey = periodType === 'break' ? 'overtimeBreak' : 'overtime'
    const overtimeKeys = Object.keys(soundConfig[configKey]).map(Number).sort((a, b) => a - b)
    const lastKey = overtimeKeys[overtimeKeys.length - 1]
    return { key: lastKey, path: soundConfig[configKey][lastKey], configKey }
}

// Create special looping versions of the last overtime sounds for both types
const workOvertimeConfig = getLastOvertimeConfig('work')
const breakOvertimeConfig = getLastOvertimeConfig('break')

const overtimeLoopingSounds = {
    work: new Howl({
        src: [workOvertimeConfig.path],
        loop: true,
        volume: 1.0,
    }),
    break: new Howl({
        src: [breakOvertimeConfig.path],
        loop: true,
        volume: 1.0,
    })
}

// Track looping sound state
let isOvertimeLoopingActive = false
let currentOvertimeLoopType = null

// Start the continuous overtime looping sound
const startOvertimeLoop = async (periodType = 'work') => {
    // If already playing the same type, do nothing
    if (isOvertimeLoopingActive && currentOvertimeLoopType === periodType) return
    
    // If playing different type, stop current first
    if (isOvertimeLoopingActive && currentOvertimeLoopType !== periodType) {
        stopOvertimeLoop()
    }
    
    // Try to unlock audio if not already unlocked
    if (!audioUnlocked) {
        await unlockAudio()
    }
    
    // Stop any other sounds before starting the loop
    Howler.stop()
    
    const loopSound = overtimeLoopingSounds[periodType] || overtimeLoopingSounds.work
    loopSound.play()
    isOvertimeLoopingActive = true
    currentOvertimeLoopType = periodType
    console.log(`🔊 Started continuous overtime loop for ${periodType}`)
}

// Stop the continuous overtime looping sound
const stopOvertimeLoop = () => {
    if (!isOvertimeLoopingActive) return // Not playing
    
    // Stop all overtime looping sounds
    Object.values(overtimeLoopingSounds).forEach(sound => sound.stop())
    isOvertimeLoopingActive = false
    currentOvertimeLoopType = null
    console.log('🔇 Stopped continuous overtime loop')
}

// Play sound from specific set
const playFromSet = async (setName, soundKey) => {
    const sound = sounds[setName]?.[soundKey]
    if (sound) {
        // Try to unlock audio if not already unlocked
        if (!audioUnlocked) {
            await unlockAudio()
        }

        Howler.stop()
        sound.play()

        // Add error handling for Howler
        sound.on('loaderror', (id, error) => {
            console.error(`Failed to load sound ${setName}/${soundKey}:`, error)
        })
        sound.on('playerror', (id, error) => {
            console.error(`Failed to play sound ${setName}/${soundKey}:`, error)
        })

        return true
    } else {
        console.error(`Sound not found: ${setName}/${soundKey}`)
        return false
    }
}

// Legacy function for backwards compatibility with general sounds
export const playSound = soundName => {
    return playFromSet('general', soundName)
}

// Sound scheduling system with collection windows
let lastPlayedSound = 0
let activeCollectionWindows = new Map() // targetTime -> { sounds: [], resolved: boolean }
let currentPeriodId = null // Track period changes to invalidate windows

// Priority levels for conflict resolution (higher number = higher priority)
const SOUND_PRIORITIES = {
    overtime: 4, // Set 4: Highest priority when in overtime
    periodEnd: 3, // Set 3: Period end announcements
    remaining: 2, // Set 2: Remaining time warnings
    elapsed: 1, // Set 1: Lowest priority
}

// Helper to check if we're within the collection window (before AND after target)
const isInCollectionWindow = (currentTime, targetTime) => {
    const timeDifference = Math.abs(currentTime - targetTime)
    return timeDifference <= COLLECTION_WINDOW
}

// Helper to check if collection window has closed (sound should be played)
const shouldPlaySound = (currentTime, targetTime) => {
    return currentTime >= targetTime + COLLECTION_WINDOW
}

// Add a sound to the collection window
const addSoundToWindow = (targetTime, soundData) => {
    if (!activeCollectionWindows.has(targetTime)) {
        activeCollectionWindows.set(targetTime, { sounds: [], resolved: false })
    }

    const window = activeCollectionWindows.get(targetTime)
    if (!window.resolved) {
        window.sounds.push(soundData)
    }
}

// Resolve conflicts and play the highest priority sound
const resolveAndPlaySounds = targetTime => {
    const window = activeCollectionWindows.get(targetTime)
    if (!window || window.resolved || window.sounds.length === 0) return

    // Sort by priority (highest first), then by type for consistency
    const sortedSounds = window.sounds.sort((a, b) => {
        const priorityDiff = SOUND_PRIORITIES[a.type] - SOUND_PRIORITIES[b.type]
        if (priorityDiff !== 0) return -priorityDiff // Negative for descending order
        return a.type.localeCompare(b.type) // Alphabetical for consistency
    })

    // Play the highest priority sound
    const winningSound = sortedSounds[0]
    console.log(
        `🔊 Playing ${winningSound.type} sound:`,
        winningSound.soundKey,
        `(beat ${sortedSounds.length - 1} other sounds)`,
    )

    playFromSet(winningSound.setName, winningSound.soundKey)
    lastPlayedSound = Date.now()

    // Mark window as resolved
    window.resolved = true

    // Note: Window cleanup is handled by cleanupOldWindows() called every tick
}

// Clean up old windows that were never resolved
const cleanupOldWindows = currentTime => {
    for (const [targetTime, window] of activeCollectionWindows.entries()) {
        // Remove unresolved windows that are well past their collection window
        if (!window.resolved && currentTime > targetTime + COLLECTION_WINDOW * 2) {
            activeCollectionWindows.delete(targetTime)
        }
        // Remove resolved windows after 10 seconds for debugging
        else if (window.resolved && currentTime > targetTime + COLLECTION_WINDOW + 10000) {
            activeCollectionWindows.delete(targetTime)
        }
    }
}

// Invalidate all collection windows (called when timing changes)
const invalidateAllWindows = (reason = 'timing change') => {
    const windowCount = activeCollectionWindows.size
    if (windowCount > 0) {
        console.log(`🔄 Invalidating ${windowCount} sound windows due to: ${reason}`)
        activeCollectionWindows.clear()
    }
}

// Generate a unique period identifier based on timing
const generatePeriodId = (periodStartTime, periodDuration) => {
    return `${periodStartTime}-${periodDuration}`
}

// Check if we're in a new period and invalidate windows if needed
const checkPeriodChange = (periodStartTime, periodDuration, periodUserIntendedDuration) => {
    // Use user intended duration for stable period ID (doesn't change with automatic extensions)
    const userIntendedDuration = periodUserIntendedDuration || periodDuration
    const newPeriodId = generatePeriodId(periodStartTime, userIntendedDuration)

    if (currentPeriodId !== newPeriodId) {
        if (currentPeriodId !== null) {
            // Only invalidate for actual period changes, not automatic extensions
            invalidateAllWindows(`period change from ${currentPeriodId} to ${newPeriodId}`)
        }
        currentPeriodId = newPeriodId
        return true
    }
    return false
}

// Set 1: Check for elapsed time announcements (dynamic intervals from config)
const scheduleElapsedTimeNotifications = (periodElapsed, periodStartTime) => {
    const intervals = getElapsedIntervals() // Get intervals from config keys
    const currentTime = Date.now()

    for (const minutes of intervals) {
        const targetTime = periodStartTime + minutes * 60 * 1000

        if (isInCollectionWindow(currentTime, targetTime)) {
            addSoundToWindow(targetTime, {
                type: 'elapsed',
                setName: 'elapsed',
                soundKey: minutes,
                targetMinutes: minutes,
            })
        }

        if (shouldPlaySound(currentTime, targetTime)) {
            resolveAndPlaySounds(targetTime)
        }
    }
}

// Set 2: Check for remaining time warnings (dynamic intervals from config)
const scheduleRemainingTimeNotifications = (periodDuration, periodStartTime) => {
    const warnings = getRemainingIntervals() // Get intervals from config keys
    const currentTime = Date.now()
    const periodEndTime = periodStartTime + periodDuration

    for (const minutes of warnings) {
        // Skip warnings for periods shorter than the warning interval
        const warningDuration = minutes * 60 * 1000
        if (periodDuration <= warningDuration) continue

        const targetTime = periodEndTime - warningDuration

        // Skip if target time is before period start (safety check)
        if (targetTime < periodStartTime) continue

        if (isInCollectionWindow(currentTime, targetTime)) {
            addSoundToWindow(targetTime, {
                type: 'remaining',
                setName: 'remaining',
                soundKey: minutes,
                targetMinutes: minutes,
            })
        }

        if (shouldPlaySound(currentTime, targetTime)) {
            resolveAndPlaySounds(targetTime)
        }
    }
}

// Set 3: Period end announcements based on next period type
export const playPeriodEndNotification = (
    nextPeriodType,
    periodElapsed,
    periodUserIntendedDuration,
) => {
    const soundKey = nextPeriodType || 'work'
    const currentTime = Date.now()

    // Only play period-end sound when we first reach the user intended duration
    // Check if we're within 1 minute of the user intended duration (first automatic extension)
    const timeSinceUserIntendedEnd = periodElapsed - periodUserIntendedDuration
    const isFirstTimeReachingEnd =
        timeSinceUserIntendedEnd >= 0 && timeSinceUserIntendedEnd <= 60000 // 1 minute

    if (isFirstTimeReachingEnd) {
        // Period end sounds have highest priority and play immediately
        addSoundToWindow(currentTime, {
            type: 'periodEnd',
            setName: 'periodEnd',
            soundKey: soundKey,
            targetMinutes: 0,
        })

        resolveAndPlaySounds(currentTime)
        console.log(`🔊 Period-end notification played for ${soundKey}`)
    } else {
        console.log(`🔇 Period-end notification skipped (already played or not first extension)`)
    }
}

// Set 4: Check for overtime announcements (dynamic intervals from config)
const scheduleOvertimeNotifications = (overtimeElapsed, overtimeStartTime, periodType = 'work') => {
    const intervals = getOvertimeIntervals(periodType) // Get intervals from config keys (excluding last)
    const currentTime = Date.now()

    console.log(
        `🔍 Scheduling overtime: ${Math.floor(overtimeElapsed / 60000)}min elapsed, checking intervals:`,
        intervals,
    )

    // Determine sound set name based on period type
    const soundSetName = periodType === 'break' ? 'overtimeBreak' : 'overtime'

    // Check intervals for this period type
    for (const minutes of intervals) {
        const targetTime = overtimeStartTime + minutes * 60 * 1000

        if (isInCollectionWindow(currentTime, targetTime)) {
            addSoundToWindow(targetTime, {
                type: 'overtime',
                setName: soundSetName,
                soundKey: minutes,
                targetMinutes: minutes,
            })
        }

        if (shouldPlaySound(currentTime, targetTime)) {
            resolveAndPlaySounds(targetTime)
        }
    }

    // Check last overtime milestone and start continuous loop thereafter
    const lastOvertimeConfig = getLastOvertimeConfig(periodType)
    const lastOvertimeThreshold = lastOvertimeConfig.key * 60 * 1000 // Convert minutes to milliseconds
    
    if (overtimeElapsed >= lastOvertimeThreshold) {
        // After reaching the last overtime milestone, start continuous looping sound
        startOvertimeLoop(periodType)
    } else {
        // Before last milestone, check for the initial milestone
        const lastOvertimeTarget = overtimeStartTime + lastOvertimeThreshold
        if (isInCollectionWindow(currentTime, lastOvertimeTarget)) {
            addSoundToWindow(lastOvertimeTarget, {
                type: 'overtime',
                setName: soundSetName,
                soundKey: lastOvertimeConfig.key,
                targetMinutes: lastOvertimeConfig.key,
            })
        }

        if (shouldPlaySound(currentTime, lastOvertimeTarget)) {
            resolveAndPlaySounds(lastOvertimeTarget)
        }
    }
}

// Main notification coordinator with windowed scheduling
export const playTimerNotifications = (
    periodElapsed,
    periodDuration,
    timestampStarted,
    periodUserIntendedDuration,
    periodType = 'work',
) => {
    const currentTime = Date.now()
    const periodStartTime = timestampStarted

    // Use user intended duration for sound calculations, fallback to actual duration if not provided
    const userIntendedDuration = periodUserIntendedDuration || periodDuration
    const isOvertime = periodElapsed > userIntendedDuration

    // Check for period changes and invalidate windows if needed
    checkPeriodChange(periodStartTime, periodDuration, periodUserIntendedDuration)

    // Clean up old windows periodically
    cleanupOldWindows(currentTime)

    if (isOvertime) {
        // Set 4: Overtime notifications (based on user intended end time)
        const overtimeStartTime = periodStartTime + userIntendedDuration
        const overtimeElapsed = periodElapsed - userIntendedDuration
        console.log(`🕐 In overtime: ${Math.floor(overtimeElapsed / 60000)} minutes overtime`)
        scheduleOvertimeNotifications(overtimeElapsed, overtimeStartTime, periodType)
    } else {
        // Stop overtime loop if we're no longer in overtime
        if (isOvertimeLoopingActive) {
            stopOvertimeLoop()
        }
        
        // Set 1: Elapsed time announcements
        scheduleElapsedTimeNotifications(periodElapsed, periodStartTime)

        // Set 2: Remaining time warnings (based on user intended duration)
        scheduleRemainingTimeNotifications(userIntendedDuration, periodStartTime)
    }
}

// Export function for manual window invalidation (called by timer when timing changes)
export const invalidateSoundWindows = reason => {
    invalidateAllWindows(reason)
    
    // Stop overtime loop when timing changes significantly
    if (isOvertimeLoopingActive) {
        stopOvertimeLoop()
    }
}
