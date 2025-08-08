import { Howl, Howler } from 'howler'
import { COLLECTION_WINDOW } from './config.js'
import { logSoundEvent } from './sound-events.js'

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
        src: ['data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA='],
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
    return Object.keys(soundConfig.elapsed)
        .map(Number)
        .sort((a, b) => a - b)
}

const getRemainingIntervals = () => {
    return Object.keys(soundConfig.remaining)
        .map(Number)
        .sort((a, b) => a - b)
}

const getOvertimeIntervals = (periodType = 'work') => {
    const configKey = periodType === 'break' ? 'overtimeBreak' : 'overtime'
    const allKeys = Object.keys(soundConfig[configKey])
        .map(Number)
        .sort((a, b) => a - b)
    // Return all keys except the last one (which is used for looping)
    return allKeys.slice(0, -1)
}

// Get the last overtime sound configuration for looping
const getLastOvertimeConfig = (periodType = 'work') => {
    const configKey = periodType === 'break' ? 'overtimeBreak' : 'overtime'
    const overtimeKeys = Object.keys(soundConfig[configKey])
        .map(Number)
        .sort((a, b) => a - b)
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
    }),
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

    // Log overtime loop start (duration data not available in this context)
    logSoundEvent('overtimeLoop', `continuous-${periodType}`, {
        action: 'start',
        periodType,
        durationElapsed: 0,
        duration: 0,
        durationUserPlanned: 0,
    })
}

// Stop the continuous overtime looping sound
const stopOvertimeLoop = () => {
    if (!isOvertimeLoopingActive) return // Not playing

    // Stop all overtime looping sounds
    Object.values(overtimeLoopingSounds).forEach(sound => sound.stop())
    const previousType = currentOvertimeLoopType
    isOvertimeLoopingActive = false
    currentOvertimeLoopType = null
    console.log('🔇 Stopped continuous overtime loop')

    // Log overtime loop stop
    if (previousType) {
        logSoundEvent('overtimeLoop', `continuous-${previousType}`, {
            action: 'stop',
            periodType: previousType,
            durationElapsed: 0,
            duration: 0,
            durationUserPlanned: 0,
        })
    }
}

// Play sound from specific set
const playFromSet = async (setName, soundKey) => {
    console.log(`🎵 [PLAY] Attempting to play sound: ${setName}/${soundKey}`)
    
    const sound = sounds[setName]?.[soundKey]
    if (sound) {
        console.log(`🎵 [PLAY] Sound object found, audioUnlocked: ${audioUnlocked}`)
        
        // Try to unlock audio if not already unlocked
        if (!audioUnlocked) {
            console.log(`🔓 [PLAY] Attempting to unlock audio...`)
            const unlocked = await unlockAudio()
            console.log(`🔓 [PLAY] Audio unlock result: ${unlocked}`)
        }

        console.log(`🔇 [PLAY] Stopping all sounds before playing new one`)
        Howler.stop()
        
        console.log(`🎵 [PLAY] Playing sound: ${setName}/${soundKey}`)
        const playId = sound.play()
        console.log(`🎵 [PLAY] Sound play() returned ID: ${playId}`)

        // Add error handling for Howler
        sound.on('loaderror', (id, error) => {
            console.error(`❌ [PLAY] Failed to load sound ${setName}/${soundKey}:`, error)
        })
        sound.on('playerror', (id, error) => {
            console.error(`❌ [PLAY] Failed to play sound ${setName}/${soundKey}:`, error)
        })
        
        sound.on('play', (id) => {
            console.log(`✅ [PLAY] Sound ${setName}/${soundKey} started playing (ID: ${id})`)
        })
        
        sound.on('end', (id) => {
            console.log(`🏁 [PLAY] Sound ${setName}/${soundKey} finished (ID: ${id})`)
        })

        return true
    } else {
        console.error(`❌ [PLAY] Sound not found: ${setName}/${soundKey}`)
        console.log(`🔍 [PLAY] Available sounds in ${setName}:`, Object.keys(sounds[setName] || {}))
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
    const inWindow = timeDifference <= COLLECTION_WINDOW
    console.log(`🪟 [WINDOW] isInCollectionWindow: currentTime=${new Date(currentTime).toISOString()}, targetTime=${new Date(targetTime).toISOString()}, diff=${Math.round(timeDifference/1000)}s, window=${COLLECTION_WINDOW/1000}s, inWindow=${inWindow}`)
    return inWindow
}

// Helper to check if collection window has closed (sound should be played)
const shouldPlaySound = (currentTime, targetTime) => {
    const shouldPlay = currentTime >= targetTime + COLLECTION_WINDOW
    const windowCloseTime = targetTime + COLLECTION_WINDOW
    const timePastClose = Math.round((currentTime - windowCloseTime) / 1000)
    console.log(`🔔 [SHOULD_PLAY] shouldPlaySound: currentTime=${new Date(currentTime).toISOString()}, windowClose=${new Date(windowCloseTime).toISOString()}, timePastClose=${timePastClose}s, shouldPlay=${shouldPlay}`)
    return shouldPlay
}

// Add a sound to the collection window
const addSoundToWindow = (targetTime, soundData) => {
    if (!activeCollectionWindows.has(targetTime)) {
        console.log(`📁 [WINDOW] Creating new collection window for ${new Date(targetTime).toISOString()}`)
        activeCollectionWindows.set(targetTime, { sounds: [], resolved: false })
    }

    const window = activeCollectionWindows.get(targetTime)
    if (!window.resolved) {
        console.log(`📁 [WINDOW] Adding ${soundData.type}/${soundData.soundKey} to window ${new Date(targetTime).toISOString()} (${window.sounds.length + 1} sounds total)`)
        window.sounds.push(soundData)
    } else {
        console.log(`📁 [WINDOW] Skipping add to resolved window ${new Date(targetTime).toISOString()}`)
    }
}

// Resolve conflicts and play the highest priority sound
const resolveAndPlaySounds = (targetTime, durationElapsed, periodDuration, periodUserIntendedDuration) => {
    const window = activeCollectionWindows.get(targetTime)
    
    console.log(`\n🎯 [RESOLVE] Attempting to resolve sounds for ${new Date(targetTime).toISOString()}`)
    
    if (!window) {
        console.log(`🔄 [RESOLVE] No window found for target time`)
        return
    }
    
    if (window.resolved) {
        console.log(`🔄 [RESOLVE] Window already resolved`)
        return
    }
    
    if (window.sounds.length === 0) {
        console.log(`🔄 [RESOLVE] No sounds in window`)
        return
    }

    console.log(`🎯 [RESOLVE] Found ${window.sounds.length} sounds in window:`, window.sounds.map(s => `${s.type}/${s.soundKey}`))

    // Sort by priority (highest first), then by type for consistency
    const sortedSounds = window.sounds.sort((a, b) => {
        const priorityDiff = SOUND_PRIORITIES[a.type] - SOUND_PRIORITIES[b.type]
        if (priorityDiff !== 0) return -priorityDiff // Negative for descending order
        return a.type.localeCompare(b.type) // Alphabetical for consistency
    })

    console.log(`🎯 [RESOLVE] After sorting by priority:`, sortedSounds.map(s => `${s.type}(${SOUND_PRIORITIES[s.type]})/${s.soundKey}`))

    // Play the highest priority sound
    const winningSound = sortedSounds[0]
    console.log(
        `🔊 [RESOLVE] Playing ${winningSound.type} sound:`,
        winningSound.soundKey,
        `(beat ${sortedSounds.length - 1} other sounds)`,
    )

    // Log sound event for debugging
    logSoundEvent(winningSound.type, winningSound.soundKey, {
        setName: winningSound.setName,
        targetMinutes: winningSound.targetMinutes,
        beatenSounds: sortedSounds.length - 1,
        allSounds: sortedSounds.map(s => `${s.type}/${s.soundKey}`),
        durationElapsed,
        duration: periodDuration,
        durationUserPlanned: periodUserIntendedDuration || periodDuration,
    })

    playFromSet(winningSound.setName, winningSound.soundKey)
    lastPlayedSound = Date.now()

    // Mark window as resolved
    window.resolved = true
    console.log(`🔒 [RESOLVE] Window marked as resolved`)

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
const scheduleElapsedTimeNotifications = (periodElapsed, periodStartTime, periodDuration, periodUserIntendedDuration) => {
    const intervals = getElapsedIntervals() // Get intervals from config keys
    const currentTime = Date.now()
    const periodElapsedMinutes = Math.floor(periodElapsed / 60000)
    
    // Only log when we're within 2 minutes of key elapsed times or have active windows
    const nearElapsedTarget = intervals.some(min => Math.abs(periodElapsedMinutes - min) <= 2)
    if (nearElapsedTarget || periodElapsedMinutes % 5 === 0) { // Log every 5 minutes or near targets
        console.log(`🔍 [ELAPSED] t=${periodElapsedMinutes}min checking intervals:`, intervals)
        console.log(`🔍 [ELAPSED] Period start: ${new Date(periodStartTime).toISOString()}, Current: ${new Date(currentTime).toISOString()}`)
    }

    for (const minutes of intervals) {
        const targetTime = periodStartTime + minutes * 60 * 1000
        const inWindow = isInCollectionWindow(currentTime, targetTime)
        const shouldPlay = shouldPlaySound(currentTime, targetTime)
        const timeDiff = Math.round((currentTime - targetTime) / 1000)
        
        // Always log when in window, should play, or near the target time
        if (inWindow || shouldPlay || Math.abs(timeDiff) <= 60) {
            console.log(`🔍 [ELAPSED] ${minutes}min target: ${new Date(targetTime).toISOString()}, timeDiff: ${timeDiff}s, inWindow: ${inWindow}, shouldPlay: ${shouldPlay}`)
        }

        if (inWindow) {
            console.log(`🔊 [ELAPSED] Adding ${minutes}min elapsed sound to collection window`)
            addSoundToWindow(targetTime, {
                type: 'elapsed',
                setName: 'elapsed',
                soundKey: minutes,
                targetMinutes: minutes,
            })
        }

        if (shouldPlay) {
            console.log(`🎵 [ELAPSED] Resolving ${minutes}min elapsed sound (past collection window)`)
            resolveAndPlaySounds(targetTime, periodElapsed, periodDuration, periodUserIntendedDuration)
        }
    }
}

// Set 2: Check for remaining time warnings (dynamic intervals from config)
const scheduleRemainingTimeNotifications = (periodDuration, periodStartTime, periodElapsed, periodUserIntendedDuration) => {
    const warnings = getRemainingIntervals() // Get intervals from config keys
    const currentTime = Date.now()
    const periodEndTime = periodStartTime + periodDuration
    const periodElapsedMinutes = Math.floor(periodElapsed / 60000)
    const periodDurationMinutes = Math.floor(periodDuration / 60000)
    
    // Calculate how much time is remaining
    const timeRemainingMinutes = Math.floor((periodDuration - periodElapsed) / 60000)
    // Only log when we're within 2 minutes of key remaining times or have active windows
    const nearRemainingTarget = warnings.some(min => Math.abs(timeRemainingMinutes - min) <= 2)
    if (nearRemainingTarget || periodElapsedMinutes % 5 === 0) { // Log every 5 minutes or near targets
        console.log(`🔍 [REMAINING] t=${periodElapsedMinutes}min (${timeRemainingMinutes}min left) checking warnings:`, warnings)
        console.log(`🔍 [REMAINING] Period end: ${new Date(periodEndTime).toISOString()}, Current: ${new Date(currentTime).toISOString()}`)
    }

    for (const minutes of warnings) {
        // Skip warnings for periods shorter than the warning interval
        const warningDuration = minutes * 60 * 1000
        if (periodDuration <= warningDuration) {
            if (nearRemainingTarget) {
            console.log(`🔍 [REMAINING] Skipping ${minutes}min warning (period ${periodDurationMinutes}min too short)`)
        }
            continue
        }

        const targetTime = periodEndTime - warningDuration
        const inWindow = isInCollectionWindow(currentTime, targetTime)
        const shouldPlay = shouldPlaySound(currentTime, targetTime)
        const timeDiff = Math.round((currentTime - targetTime) / 1000)

        // Skip if target time is before period start (safety check)
        if (targetTime < periodStartTime) {
            if (nearRemainingTarget) {
                console.log(`🔍 [REMAINING] Skipping ${minutes}min warning (target before period start)`)
            }
            continue
        }
        
        // Always log when in window, should play, or near the target time
        if (inWindow || shouldPlay || Math.abs(timeDiff) <= 60) {
            console.log(`🔍 [REMAINING] ${minutes}min remaining target: ${new Date(targetTime).toISOString()}, timeDiff: ${timeDiff}s, inWindow: ${inWindow}, shouldPlay: ${shouldPlay}`)
        }

        if (inWindow) {
            console.log(`🔊 [REMAINING] Adding ${minutes}min remaining sound to collection window`)
            addSoundToWindow(targetTime, {
                type: 'remaining',
                setName: 'remaining',
                soundKey: minutes,
                targetMinutes: minutes,
            })
        }

        if (shouldPlay) {
            console.log(`🎵 [REMAINING] Resolving ${minutes}min remaining sound (past collection window)`)
            resolveAndPlaySounds(targetTime, periodElapsed, periodDuration, periodUserIntendedDuration)
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
    const periodElapsedMinutes = Math.floor(periodElapsed / 60000)
    const userIntendedMinutes = Math.floor(periodUserIntendedDuration / 60000)

    // Only play period-end sound when we first reach the user intended duration
    // Check if we're within 1 minute of the user intended duration (first automatic extension)
    const timeSinceUserIntendedEnd = periodElapsed - periodUserIntendedDuration
    const isFirstTimeReachingEnd =
        timeSinceUserIntendedEnd >= 0 && timeSinceUserIntendedEnd <= 60000 // 1 minute
        
    console.log(`\n🔔 [PERIOD_END] Called with:`, {
        nextPeriodType,
        periodElapsed: `${periodElapsedMinutes}min`,
        periodUserIntendedDuration: `${userIntendedMinutes}min`,
        timeSinceUserIntendedEnd: `${Math.round(timeSinceUserIntendedEnd / 1000)}s`,
        isFirstTimeReachingEnd,
        soundKey
    })

    if (isFirstTimeReachingEnd) {
        console.log(`🔊 [PERIOD_END] Playing period-end notification for ${soundKey} (first time reaching end)`)
        
        // Period end sounds have highest priority and play immediately
        addSoundToWindow(currentTime, {
            type: 'periodEnd',
            setName: 'periodEnd',
            soundKey: soundKey,
            targetMinutes: 0,
        })

        resolveAndPlaySounds(currentTime, periodElapsed, 0, periodUserIntendedDuration)
        console.log(`🔊 Period-end notification played for ${soundKey}`)

        // Log period end notification
        logSoundEvent('periodEnd', soundKey, {
            nextPeriodType: nextPeriodType,
            elapsedMinutes: Math.floor(periodElapsed / 60000),
            userIntendedMinutes: Math.floor(periodUserIntendedDuration / 60000),
            durationElapsed: periodElapsed,
            duration: 0, // Period duration not available in this function
            durationUserPlanned: periodUserIntendedDuration,
        })
    } else {
        console.log(`🔇 [PERIOD_END] Period-end notification skipped - timeSinceEnd: ${Math.round(timeSinceUserIntendedEnd / 1000)}s, isFirstTime: ${isFirstTimeReachingEnd}`)
    }
}

// Set 4: Check for overtime announcements (dynamic intervals from config)
const scheduleOvertimeNotifications = (overtimeElapsed, overtimeStartTime, periodType, periodElapsed, periodDuration, periodUserIntendedDuration) => {
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
            resolveAndPlaySounds(targetTime, periodElapsed, periodDuration, periodUserIntendedDuration)
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
            resolveAndPlaySounds(lastOvertimeTarget, periodElapsed, periodDuration, periodUserIntendedDuration)
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
    const periodElapsedMinutes = Math.floor(periodElapsed / 60000)
    const periodDurationMinutes = Math.floor(periodDuration / 60000)
    const userIntendedMinutes = Math.floor((periodUserIntendedDuration || periodDuration) / 60000)

    // Use user intended duration for sound calculations, fallback to actual duration if not provided
    const userIntendedDuration = periodUserIntendedDuration || periodDuration
    const isOvertime = periodElapsed > userIntendedDuration
    
    // Only log every 10 seconds to reduce noise, but always log for key minutes
    const logMinutes = [6, 12, 18, 24, 30] // Key minutes to always log
    const shouldLog = logMinutes.includes(periodElapsedMinutes) || periodElapsedMinutes % 1 === 0 // Log every minute
    
    if (shouldLog) {
        console.log(`\n🎯 [TIMER_NOTIFICATIONS] t=${periodElapsedMinutes}min:`, {
            periodElapsed: `${periodElapsedMinutes}min`,
            periodDuration: `${periodDurationMinutes}min`,
            userIntendedDuration: `${userIntendedMinutes}min`,
            periodType,
            isOvertime,
            timestampStarted: new Date(timestampStarted).toISOString(),
            currentTime: new Date(currentTime).toISOString()
        })
    }

    // Check for period changes and invalidate windows if needed
    checkPeriodChange(periodStartTime, periodDuration, periodUserIntendedDuration)

    // Clean up old windows periodically
    cleanupOldWindows(currentTime)

    if (isOvertime) {
        // Set 4: Overtime notifications (based on user intended end time)
        const overtimeStartTime = periodStartTime + userIntendedDuration
        const overtimeElapsed = periodElapsed - userIntendedDuration
        console.log(`🕐 In overtime: ${Math.floor(overtimeElapsed / 60000)} minutes overtime`)
        scheduleOvertimeNotifications(overtimeElapsed, overtimeStartTime, periodType, periodElapsed, periodDuration, periodUserIntendedDuration)
    } else {
        // Stop overtime loop if we're no longer in overtime
        if (isOvertimeLoopingActive) {
            stopOvertimeLoop()
        }

        if (shouldLog) {
            console.log(`🔍 [TIMER_NOTIFICATIONS] Scheduling normal period sounds (not overtime)`)
        }
        
        // Set 1: Elapsed time announcements
        scheduleElapsedTimeNotifications(periodElapsed, periodStartTime, periodDuration, periodUserIntendedDuration)

        // Set 2: Remaining time warnings (based on user intended duration)
        scheduleRemainingTimeNotifications(userIntendedDuration, periodStartTime, periodElapsed, periodUserIntendedDuration)
    }
    
    if (shouldLog || activeCollectionWindows.size > 0) {
        console.log(`🔍 [TIMER_NOTIFICATIONS] Active collection windows: ${activeCollectionWindows.size}`)
        for (const [targetTime, window] of activeCollectionWindows.entries()) {
            console.log(`  - Target: ${new Date(targetTime).toISOString()}, sounds: ${window.sounds.length}, resolved: ${window.resolved}`)
        }
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
