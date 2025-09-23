import {Howl, Howler} from 'howler'
import {AVAILABLE_SOUNDS} from './sound-discovery'
import {log} from "./log.js";

// Audio context unlock state
let audioUnlocked = false

// Sound playback tracking for debug table
export const soundPlaybackLog = []
const MAX_LOG_ENTRIES = 50

const addSoundLog = (soundKey, success, error = null, retryAttempt = false) => {
    const logEntry = {
        timestamp: Date.now(),
        soundKey,
        success,
        error: error?.message || null,
        retry: retryAttempt
    }

    soundPlaybackLog.unshift(logEntry)
    if (soundPlaybackLog.length > MAX_LOG_ENTRIES) {
        soundPlaybackLog.pop()
    }
}

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
        log('🔊 Audio context', 'unlocked successfully', 3)

        return true
    } catch (error) {
        log('🔊 Failed to unlock audio context', error, 2)
        return false
    }
}


// Build sound configuration dynamically based on available sounds
const buildSoundConfig = () => {
    // Skip if we're in a Node.js build environment (no window object)
    if (typeof window === 'undefined') {
        return {}
    }


    const config = {
        // Keep existing general sounds
        button: new Howl({src: ['/tymer/sounds/button.webm'], loop: false}),
        timerFinished: new Howl({src: ['/tymer/sounds/timer-end.webm'], loop: false}),
    }

    // Build elapsed sounds
    AVAILABLE_SOUNDS.elapsed.forEach(min => {
        const key = `elapsed_${min}`
        const path = `/tymer/sounds/elapsed/${String(min).padStart(3, '0')}.webm`
        config[key] = new Howl({src: [path], loop: false})
    })

    // Build remaining sounds
    AVAILABLE_SOUNDS.remaining.forEach(min => {
        const key = `remaining_${min}`
        const path = `/tymer/sounds/remaining/${String(min).padStart(3, '0')}.webm`
        config[key] = new Howl({src: [path], loop: false})
    })

    // Build timesup sounds
    const timesupTypes = ['work', 'break', 'fun', 'finish']
    for (const type of timesupTypes) {
        config[`timesup_${type}`] = new Howl({
            src: [`/tymer/sounds/timesup/${type}.webm`],
            loop: false
        })
    }

    // Build overtime sounds
    AVAILABLE_SOUNDS.overtime.forEach(min => {
        const key = `overtime_${min}`
        const path = `/tymer/sounds/overtime/${String(min).padStart(3, '0')}.webm`
        config[key] = new Howl({src: [path], loop: false})
    })

    // Build break overtime sounds
    AVAILABLE_SOUNDS.overtimeBreak.forEach(min => {
        const key = `overtime_break_${min}`
        const path = `/tymer/sounds/overtime/break/${String(min).padStart(3, '0')}.webm`
        config[key] = new Howl({src: [path], loop: false})
    })

    return config
}

// Create all sound instances
const sounds = buildSoundConfig()

// Export sound paths for build-time preloading
export const soundConfig = {
    elapsed: AVAILABLE_SOUNDS.elapsed.reduce((acc, min) => {
        acc[`${min}min`] = `/tymer/sounds/elapsed/${String(min).padStart(3, '0')}.webm`
        return acc
    }, {}),
    remaining: AVAILABLE_SOUNDS.remaining.reduce((acc, min) => {
        acc[`${min}min`] = `/tymer/sounds/remaining/${String(min).padStart(3, '0')}.webm`
        return acc
    }, {}),
    timesup: {
        work: '/tymer/sounds/timesup/work.webm',
        break: '/tymer/sounds/timesup/break.webm',
        fun: '/tymer/sounds/timesup/fun.webm',
        finish: '/tymer/sounds/timesup/finish.webm'
    },
    overtime: AVAILABLE_SOUNDS.overtime.reduce((acc, min) => {
        acc[`${min}min`] = `/tymer/sounds/overtime/${String(min).padStart(3, '0')}.webm`
        return acc
    }, {}),
    overtimeBreak: AVAILABLE_SOUNDS.overtimeBreak.reduce((acc, min) => {
        acc[`${min}min`] = `/tymer/sounds/overtime/break/${String(min).padStart(3, '0')}.webm`
        return acc
    }, {}),
    general: {
        button: '/tymer/sounds/button.webm',
        timerFinished: '/tymer/sounds/timer-end.webm'
    }
}

// Play any sound by its key
const playByKey = async (soundKey) => {
    const sound = sounds[soundKey]
    if (!sound) {
        log('🔊 Sound not found', soundKey, 2)
        addSoundLog(soundKey, false, new Error('Sound not found'))
        return false
    }

    try {
        // Try to unlock audio if not already unlocked
        if (!audioUnlocked) {
            const unlocked = await unlockAudio()
            if (!unlocked) {
                log('🔊 Audio unlock failed for', soundKey, 2)
                addSoundLog(soundKey, false, new Error('Audio unlock failed'))
                return false
            }
        }

        Howler.stop()
        sound.play()
        log('🔊 Sound played successfully', soundKey, 10)
        addSoundLog(soundKey, true)
        return true
    } catch (error) {
        log('🔊 Sound play failed', `${soundKey}: ${error.message}`, 2)
        addSoundLog(soundKey, false, error)

        // Try to re-unlock and retry once
        try {
            await unlockAudio()
            sound.play()
            log('🔊 Sound played after re-unlock', soundKey, 10)
            addSoundLog(soundKey, true, null, true)
            return true
        } catch (retryError) {
            log('🔊 Sound retry failed', `${soundKey}: ${retryError.message}`, 1)
            addSoundLog(soundKey, false, retryError, true)
            return false
        }
    }
}

// Legacy function for backwards compatibility with general sounds
export const playSound = soundName => {
    return playByKey(soundName)
}

// Simple timer finished sound function
export const playTimerFinishedSound = () => {
    return playByKey('timerFinished')
}

// New function to play period-based sounds
export const playPeriodSound = (soundKey) => {
    log('🔊 Playing period sound', soundKey, 10)
    return playByKey(soundKey)
}

// Helper to get sound key from sound path (for SoundScheduler integration)
export const getSoundKeyFromPath = (soundPath) => {
    // Convert path like 'sounds/elapsed/006.webm' to key like 'elapsed_6'
    const pathParts = soundPath.split('/')
    const filename = pathParts[pathParts.length - 1] // '006.webm'
    const folder = pathParts[pathParts.length - 2] // 'elapsed'
    const subfolder = pathParts.length > 3 ? pathParts[pathParts.length - 3] : null // 'break' for overtime

    const minutes = parseInt(filename.replace('.webm', ''))

    if (folder === 'timesup') {
        const periodType = filename.replace('.webm', '') // 'work', 'break', 'fun', 'finish'
        return `timesup_${periodType}`
    } else if (folder === 'break' && subfolder === 'overtime') {
        return `overtime_break_${minutes}`
    } else {
        return `${folder}_${minutes}`
    }
}
