import { Howl, Howler } from 'howler'
import { signal } from '@preact/signals'
import { AVAILABLE_SOUNDS } from './sound-discovery'
import { SOUND_VARIANTS } from './sound-manifest.js'
import { pickVariant } from './pick-variant.js'
import { log } from './log.js'

// Resolves the variant paths for a sound key from the generated manifest.
// A key absent from the manifest resolves to no variants — callers (playByKey,
// playRandomNotification) already treat an empty list as "sound not found".
export const getVariantPaths = key => {
    return SOUND_VARIANTS[key] ?? []
}

// The complete set of sound keys the app needs, derived from the discovery
// config rather than hand-written so it can never drift from it.
export const REQUIRED_SOUND_KEYS = [
    ...AVAILABLE_SOUNDS.elapsed.map(min => `elapsed_${min}`),
    ...AVAILABLE_SOUNDS.remaining.map(min => `remaining_${min}`),
    ...AVAILABLE_SOUNDS.overtime.map(min => `overtime_${min}`),
    ...AVAILABLE_SOUNDS.overtimeBreak.map(min => `overtime_break_${min}`),
    ...Array.from({ length: 63 }, (_, i) => `notification_${i + 1}`),
    'button',
    'timerFinished',
    'timesup_work',
    'timesup_break',
    'timesup_fun',
    'timesup_finish',
]

// Audio context unlock state — a signal so the UI can flag "audio not activated
// yet" (browsers block playback until the first user gesture).
export const audioUnlocked = signal(false)

// User mute toggle, persisted. Default: sound on.
const SOUND_ENABLED_KEY = 'soundEnabled'

const loadSoundEnabled = () => {
    try {
        return localStorage.getItem(SOUND_ENABLED_KEY) !== 'false'
    } catch {
        return true
    }
}

export const soundEnabled = signal(loadSoundEnabled())

export const toggleSound = () => {
    soundEnabled.value = !soundEnabled.value
    try {
        localStorage.setItem(SOUND_ENABLED_KEY, String(soundEnabled.value))
    } catch {
        // Ignore storage failures — the in-memory toggle still applies.
    }
    // Silence anything already playing when muting.
    if (!soundEnabled.value) Howler.stop()
}

// Sound playback tracking for debug table
export const soundPlaybackLog = []
const MAX_LOG_ENTRIES = 50

const addSoundLog = (
    soundKey,
    success,
    error = null,
    retryAttempt = false,
    periodContext = null,
) => {
    const logEntry = {
        timestamp: Date.now(),
        soundKey,
        success,
        error: error?.message || null,
        retry: retryAttempt,
        periodContext,
    }

    soundPlaybackLog.unshift(logEntry)
    if (soundPlaybackLog.length > MAX_LOG_ENTRIES) {
        soundPlaybackLog.pop()
    }
}

// Function to unlock audio context on user interaction
export const unlockAudio = async () => {
    if (audioUnlocked.value) return true

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

        audioUnlocked.value = true
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

    const missing = []
    const config = {}

    REQUIRED_SOUND_KEYS.forEach(key => {
        const variants = getVariantPaths(key)
        if (variants.length === 0) missing.push(key)
        config[key] = variants.map(src => new Howl({ src: [src], loop: false }))
    })

    if (missing.length > 0) {
        log('🔊 Sounds missing from manifest', missing.join(', '), 2)
    }

    return config
}

// Create all sound instances (each key holds an array of Howls, one per variant)
const sounds = buildSoundConfig()

// Bookkeeping only, never rendered — the last variant index played per sound
// key, so consecutive plays of a 2+ variant key don't repeat the same take.
const lastVariantIndex = new Map()

// Export sound variant paths for build-time preloading. Each leaf is an
// array of variant paths (one per interchangeable take), so a preload
// consumer gets every variant of every event.
export const soundConfig = {
    elapsed: AVAILABLE_SOUNDS.elapsed.reduce((acc, min) => {
        acc[`${min}min`] = getVariantPaths(`elapsed_${min}`)
        return acc
    }, {}),
    remaining: AVAILABLE_SOUNDS.remaining.reduce((acc, min) => {
        acc[`${min}min`] = getVariantPaths(`remaining_${min}`)
        return acc
    }, {}),
    timesup: {
        work: getVariantPaths('timesup_work'),
        break: getVariantPaths('timesup_break'),
        fun: getVariantPaths('timesup_fun'),
        finish: getVariantPaths('timesup_finish'),
    },
    overtime: AVAILABLE_SOUNDS.overtime.reduce((acc, min) => {
        acc[`${min}min`] = getVariantPaths(`overtime_${min}`)
        return acc
    }, {}),
    overtimeBreak: AVAILABLE_SOUNDS.overtimeBreak.reduce((acc, min) => {
        acc[`${min}min`] = getVariantPaths(`overtime_break_${min}`)
        return acc
    }, {}),
    general: {
        button: getVariantPaths('button'),
        timerFinished: getVariantPaths('timerFinished'),
    },
}

// Get period context for logging
const getPeriodContext = () => {
    try {
        // Use require to get current timer module state synchronously
        // This avoids circular dependency issues
        const getTimerState = () => {
            if (typeof window !== 'undefined' && window.__timerModule) {
                return window.__timerModule
            }
            return null
        }

        const timerModule = getTimerState()
        if (!timerModule) return null

        const currentPeriod = timerModule.currentPeriod?.value

        if (currentPeriod) {
            const elapsedMs = currentPeriod.state.elapsed
            const intendedDuration = currentPeriod.config.userIntendedDuration
            const remainingMs = intendedDuration - elapsedMs
            const isOvertime = elapsedMs > intendedDuration

            return {
                periodType: currentPeriod.config.type,
                periodDuration: intendedDuration,
                elapsed: elapsedMs,
                remaining: remainingMs > 0 ? remainingMs : 0,
                overtime: isOvertime ? elapsedMs - intendedDuration : 0,
                periodIndex: timerModule.Schedule?.currentPeriodIndex.value ?? 0,
            }
        }
    } catch (e) {
        // Ignore errors during initialization
    }
    return null
}

// Play any sound by its key
const playByKey = async soundKey => {
    if (!soundEnabled.value) return false

    const variants = sounds[soundKey]
    const periodContext = getPeriodContext()

    if (!variants || variants.length === 0) {
        log('🔊 Sound not found', soundKey, 2)
        addSoundLog(soundKey, false, new Error('Sound not found'), false, periodContext)
        return false
    }

    const variantIndex = pickVariant(variants, lastVariantIndex.get(soundKey) ?? -1)
    lastVariantIndex.set(soundKey, variantIndex)
    const sound = variants[variantIndex]

    try {
        // Try to unlock audio if not already unlocked
        if (!audioUnlocked.value) {
            const unlocked = await unlockAudio()
            if (!unlocked) {
                log('🔊 Audio unlock failed for', soundKey, 2)
                addSoundLog(soundKey, false, new Error('Audio unlock failed'), false, periodContext)
                return false
            }
        }

        Howler.stop()
        sound.play()
        log('🔊 Sound played successfully', soundKey, 10)
        addSoundLog(soundKey, true, null, false, periodContext)
        return true
    } catch (error) {
        log('🔊 Sound play failed', `${soundKey}: ${error.message}`, 2)
        addSoundLog(soundKey, false, error, false, periodContext)

        // Try to re-unlock and retry once
        try {
            await unlockAudio()
            sound.play()
            log('🔊 Sound played after re-unlock', soundKey, 10)
            addSoundLog(soundKey, true, null, true, periodContext)
            return true
        } catch (retryError) {
            log('🔊 Sound retry failed', `${soundKey}: ${retryError.message}`, 1)
            addSoundLog(soundKey, false, retryError, true, periodContext)
            return false
        }
    }
}

// Play a random notification sound (1-63)
const playRandomNotification = async () => {
    if (!soundEnabled.value) return false

    const randomNum = Math.floor(Math.random() * 63) + 1 // 1-63
    const notificationKey = `notification_${randomNum}`

    log('🔊 Playing random notification', notificationKey, 10)

    const variants = sounds[notificationKey]
    if (!variants || variants.length === 0) {
        log('🔊 Notification sound not found', notificationKey, 2)
        return false
    }

    const variantIndex = pickVariant(variants, lastVariantIndex.get(notificationKey) ?? -1)
    lastVariantIndex.set(notificationKey, variantIndex)
    const sound = variants[variantIndex]

    try {
        if (!audioUnlocked.value) await unlockAudio()

        // Play notification and wait for it to complete
        return new Promise(resolve => {
            const soundId = sound.play()
            log('🔊 Notification started', `${notificationKey} (ID: ${soundId})`, 10)
            sound.once(
                'end',
                () => {
                    log('🔊 Notification ended', notificationKey, 10)
                    resolve(true)
                },
                soundId,
            )
            sound.once(
                'playerror',
                (id, error) => {
                    log('🔊 Notification error', `${notificationKey}: ${error}`, 2)
                    resolve(false)
                },
                soundId,
            )
        })
    } catch (error) {
        log('🔊 Notification play failed', `${notificationKey}: ${error.message}`, 2)
        return false
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
export const playPeriodSound = async soundKey => {
    await playRandomNotification()
    log('🔊 Playing period sound', soundKey, 10)
    return playByKey(soundKey)
}

// Helper to get sound key from sound path (for SoundScheduler integration)
export const getSoundKeyFromPath = soundPath => {
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
