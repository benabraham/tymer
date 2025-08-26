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

// Sound configuration - simplified to button clicks and timer finish only
export const soundConfig = {
    // General sounds
    general: {
        button: '/tymer/sounds/button.webm',
        timerFinished: '/tymer/sounds/timer-end.webm',
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
        return true
    }
    return false
}

// Legacy function for backwards compatibility with general sounds
export const playSound = soundName => {
    return playFromSet('general', soundName)
}

// Simple timer finished sound function
export const playTimerFinishedSound = () => {
    return playFromSet('general', 'timerFinished')
}

// Button click handler with sound
export const handleButtonClick = async (onClick) => {
    // Play button sound
    await playSound('button')
    
    // Execute the actual click handler
    if (onClick && typeof onClick === 'function') {
        return onClick()
    }
}
