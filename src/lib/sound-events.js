import { signal, computed } from '@preact/signals'

const STORAGE_KEY = 'tymer-sound-events'
const MAX_EVENTS = 1000

export const soundEvents = signal([])

const loadSoundEvents = () => {
    try {
        const stored = localStorage.getItem(STORAGE_KEY)
        if (stored) {
            const events = JSON.parse(stored)
            soundEvents.value = Array.isArray(events) ? events.slice(-MAX_EVENTS) : []
        }
    } catch (error) {
        console.error('Failed to load sound events from localStorage:', error)
        soundEvents.value = []
    }
}

const saveSoundEvents = (events) => {
    try {
        const eventsToSave = events.slice(-MAX_EVENTS)
        localStorage.setItem(STORAGE_KEY, JSON.stringify(eventsToSave))
    } catch (error) {
        console.error('Failed to save sound events to localStorage:', error)
    }
}

export const logSoundEvent = (eventType, soundKey, additionalData = {}) => {
    const event = {
        timestamp: Date.now(),
        time: new Date().toLocaleTimeString(),
        type: eventType,
        sound: soundKey,
        ...additionalData
    }
    
    const newEvents = [...soundEvents.value, event].slice(-MAX_EVENTS)
    soundEvents.value = newEvents
    saveSoundEvents(newEvents)
    
    console.log(`🔊 Sound Event: ${eventType}/${soundKey}`, additionalData)
}

export const clearSoundEvents = () => {
    soundEvents.value = []
    try {
        localStorage.removeItem(STORAGE_KEY)
    } catch (error) {
        console.error('Failed to clear sound events from localStorage:', error)
    }
}

export const recentSoundEvents = computed(() => {
    return soundEvents.value.slice().reverse()
})

export const initializeSoundEvents = () => {
    if (typeof window !== 'undefined' && window.localStorage) {
        loadSoundEvents()
    }
}

if (typeof window !== 'undefined' && window.localStorage) {
    initializeSoundEvents()
}