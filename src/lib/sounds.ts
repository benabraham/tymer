import { type Signal, signal } from '@preact/signals'
import { Howl, Howler } from 'howler'
import { log } from './log.js'
import type { PeriodData, PeriodType } from './period.js'
import { pickVariant } from './pick-variant.js'
import { AVAILABLE_SOUNDS } from './sound-discovery'
import { SOUND_VARIANTS, type SoundVariant } from './sound-manifest.js'
import { ALL_SETS, activeSoundSet } from './sound-set.js'

// Minimal shape sounds.js reads off `window.__timerModule` (assigned by
// timer.ts). Kept structural/local rather than importing timer.ts to avoid a
// circular dependency (timer.ts imports this module).
type TimerModuleGlobal = {
    timerState?: unknown
    currentPeriod?: { value: PeriodData | undefined }
    Schedule?: { currentPeriodIndex: { value: number | null } }
}

declare global {
    interface Window {
        __timerModule?: TimerModuleGlobal
    }
}

// Resolves the variants (objects) for a sound key from the generated manifest.
// A key absent from the manifest resolves to no variants — callers (playByKey,
// playNotification) already treat an empty list as "sound not found".
export const getVariants = (key: string): SoundVariant[] => SOUND_VARIANTS[key] ?? []

// Resolves just the variant paths — consumed by soundConfig (build-time
// preload export) and by tests that guard the full pool regardless of the
// active set selection.
export const getVariantPaths = (key: string): string[] => getVariants(key).map(v => v.src)

// Narrows `variants` to the given set. `ALL_SETS` returns everything
// unchanged — today's behavior. Otherwise, filters to just that set's takes,
// BUT falls back to the full pool when the filter matches nothing: set-less
// keys (button, the 78 notifications, timerFinished) carry no set at all and
// must keep playing under every selection, and a half-generated set degrades
// to the full pool instead of going silent — the exact silent-404-Howl trap
// CLAUDE.md documents from the old hardcoded-fallback bug.
export const pickCandidates = <T extends { set: string | null }>({
    variants,
    set,
}: {
    variants: T[]
    set: string
}): T[] => {
    if (set === ALL_SETS) return variants

    const filtered = variants.filter(v => v.set === set)
    return filtered.length > 0 ? filtered : variants
}

// The complete set of sound keys the app needs, derived from the discovery
// config rather than hand-written so it can never drift from it.
export const REQUIRED_SOUND_KEYS: string[] = [
    ...AVAILABLE_SOUNDS.elapsed.map(min => `elapsed_${min}`),
    ...AVAILABLE_SOUNDS.remaining.map(min => `remaining_${min}`),
    ...AVAILABLE_SOUNDS.overtime.map(min => `overtime_${min}`),
    ...AVAILABLE_SOUNDS.overtimeBreak.map(min => `overtime_break_${min}`),
    ...Array.from({ length: 78 }, (_, i) => `notification_${i + 1}`),
    'button',
    'timerFinished',
    'timesup_work',
    'timesup_break',
    'timesup_fun',
    'timesup_finish',
]

// Audio context unlock state — a signal so the UI can flag "audio not activated
// yet" (browsers block playback until the first user gesture).
export const audioUnlocked: Signal<boolean> = signal(false)

// User mute toggle, persisted. Default: sound on.
const SOUND_ENABLED_KEY = 'soundEnabled'

const loadSoundEnabled = (): boolean => {
    try {
        return localStorage.getItem(SOUND_ENABLED_KEY) !== 'false'
    } catch {
        return true
    }
}

export const soundEnabled: Signal<boolean> = signal(loadSoundEnabled())

export const toggleSound = (): void => {
    soundEnabled.value = !soundEnabled.value
    try {
        localStorage.setItem(SOUND_ENABLED_KEY, String(soundEnabled.value))
    } catch {
        // Ignore storage failures — the in-memory toggle still applies.
    }
    // Silence anything already playing when muting.
    if (!soundEnabled.value) Howler.stop()
}

// Period context captured at play time, mirroring the currently-playing
// period's timing — used only for the debug playback log.
type PeriodContext = {
    periodType: PeriodType
    periodDuration: number
    elapsed: number
    remaining: number
    overtime: number
    periodIndex: number
}

type SoundLogEntry = {
    timestamp: number
    soundKey: string
    success: boolean
    error: string | null
    retry: boolean
    periodContext: PeriodContext | null
}

// Sound playback tracking for debug table
export const soundPlaybackLog: SoundLogEntry[] = []
const MAX_LOG_ENTRIES = 50

// Extracts a display message from an unknown thrown value the same way
// `error?.message || null` did: any object carrying a (possibly falsy)
// `message` property resolves that property (falling back to null when it is
// falsy), everything else (including non-object throws) resolves to null.
const getErrorMessage = (error: unknown): string | null => {
    if (error !== null && typeof error === 'object' && 'message' in error) {
        const message = (error as { message: unknown }).message
        return (message as string | undefined) || null
    }
    return null
}

const addSoundLog = (
    soundKey: string,
    success: boolean,
    error: unknown = null,
    retryAttempt: boolean = false,
    periodContext: PeriodContext | null = null,
): void => {
    const logEntry: SoundLogEntry = {
        timestamp: Date.now(),
        soundKey,
        success,
        error: getErrorMessage(error),
        retry: retryAttempt,
        periodContext,
    }

    soundPlaybackLog.unshift(logEntry)
    if (soundPlaybackLog.length > MAX_LOG_ENTRIES) {
        soundPlaybackLog.pop()
    }
}

// Function to unlock audio context on user interaction
export const unlockAudio = async (): Promise<boolean> => {
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

type SoundEntry = { set: string | null; howl: Howl }
type SoundConfigMap = Record<string, SoundEntry[]>

// Build sound configuration dynamically based on available sounds
const buildSoundConfig = (): SoundConfigMap => {
    // Skip if we're in a Node.js build environment (no window object)
    if (typeof window === 'undefined') {
        return {}
    }

    const missing: string[] = []
    const config: SoundConfigMap = {}

    REQUIRED_SOUND_KEYS.forEach(key => {
        const variants = getVariants(key)
        if (variants.length === 0) missing.push(key)
        config[key] = variants.map(({ src, set }) => ({
            set,
            howl: new Howl({ src: [src], loop: false }),
        }))
    })

    if (missing.length > 0) {
        log('🔊 Sounds missing from manifest', missing.join(', '), 2)
    }

    return config
}

// Create all sound instances (each key holds an array of Howls, one per variant)
const sounds: SoundConfigMap = buildSoundConfig()

// Bookkeeping only, never rendered — the last variant index played per sound
// key, so consecutive plays of a 2+ variant key don't repeat the same take.
const lastVariantIndex = new Map<string, number>()

// Export sound variant paths for build-time preloading. Each leaf is an
// array of variant paths (one per interchangeable take), so a preload
// consumer gets every variant of every event.
export const soundConfig = {
    elapsed: AVAILABLE_SOUNDS.elapsed.reduce<Record<string, string[]>>((acc, min) => {
        acc[`${min}min`] = getVariantPaths(`elapsed_${min}`)
        return acc
    }, {}),
    remaining: AVAILABLE_SOUNDS.remaining.reduce<Record<string, string[]>>((acc, min) => {
        acc[`${min}min`] = getVariantPaths(`remaining_${min}`)
        return acc
    }, {}),
    timesup: {
        work: getVariantPaths('timesup_work'),
        break: getVariantPaths('timesup_break'),
        fun: getVariantPaths('timesup_fun'),
        finish: getVariantPaths('timesup_finish'),
    },
    overtime: AVAILABLE_SOUNDS.overtime.reduce<Record<string, string[]>>((acc, min) => {
        acc[`${min}min`] = getVariantPaths(`overtime_${min}`)
        return acc
    }, {}),
    overtimeBreak: AVAILABLE_SOUNDS.overtimeBreak.reduce<Record<string, string[]>>((acc, min) => {
        acc[`${min}min`] = getVariantPaths(`overtime_break_${min}`)
        return acc
    }, {}),
    general: {
        button: getVariantPaths('button'),
        timerFinished: getVariantPaths('timerFinished'),
    },
}

// Get period context for logging
const getPeriodContext = (): PeriodContext | null => {
    try {
        // Use require to get current timer module state synchronously
        // This avoids circular dependency issues
        const getTimerState = (): TimerModuleGlobal | null => {
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
    } catch {
        // Ignore errors during initialization
    }
    return null
}

// Play any sound by its key
const playByKey = async (soundKey: string): Promise<boolean> => {
    if (!soundEnabled.value) return false

    const allVariants = sounds[soundKey]
    const periodContext = getPeriodContext()

    if (!allVariants || allVariants.length === 0) {
        log('🔊 Sound not found', soundKey, 2)
        addSoundLog(soundKey, false, new Error('Sound not found'), false, periodContext)
        return false
    }

    const set = activeSoundSet.value
    const candidates = pickCandidates({ variants: allVariants, set })
    const indexKey = `${soundKey}|${set}`
    const variantIndex = pickVariant(candidates, lastVariantIndex.get(indexKey) ?? -1)
    lastVariantIndex.set(indexKey, variantIndex)
    const sound = candidates[variantIndex].howl

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
        log('🔊 Sound play failed', `${soundKey}: ${getErrorMessage(error)}`, 2)
        addSoundLog(soundKey, false, error, false, periodContext)

        // Try to re-unlock and retry once
        try {
            await unlockAudio()
            sound.play()
            log('🔊 Sound played after re-unlock', soundKey, 10)
            addSoundLog(soundKey, true, null, true, periodContext)
            return true
        } catch (retryError) {
            log('🔊 Sound retry failed', `${soundKey}: ${getErrorMessage(retryError)}`, 1)
            addSoundLog(soundKey, false, retryError, true, periodContext)
            return false
        }
    }
}

// Picks a random notification key ('notification_1'…'notification_78'). The
// deadline alarm uses this to choose its chime ONCE per deadline and then
// replays that same key, so picking and playing are separate.
export const pickRandomNotificationKey = (): string =>
    `notification_${Math.floor(Math.random() * 78) + 1}`

// Play a specific notification chime by key. Resolves when the clip has
// finished playing (or failed) — the deadline alarm loop relies on that to
// chain repetitions gaplessly.
export const playNotification = async (notificationKey: string): Promise<boolean> => {
    if (!soundEnabled.value) return false

    log('🔊 Playing notification', notificationKey, 10)

    const allVariants = sounds[notificationKey]
    if (!allVariants || allVariants.length === 0) {
        log('🔊 Notification sound not found', notificationKey, 2)
        return false
    }

    const set = activeSoundSet.value
    const candidates = pickCandidates({ variants: allVariants, set })
    const indexKey = `${notificationKey}|${set}`
    const variantIndex = pickVariant(candidates, lastVariantIndex.get(indexKey) ?? -1)
    lastVariantIndex.set(indexKey, variantIndex)
    const sound = candidates[variantIndex].howl

    try {
        if (!audioUnlocked.value) await unlockAudio()

        // Play notification and wait for it to complete
        return new Promise<boolean>(resolve => {
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
                (_id: number, error: unknown) => {
                    log('🔊 Notification error', `${notificationKey}: ${error}`, 2)
                    resolve(false)
                },
                soundId,
            )
        })
    } catch (error) {
        log('🔊 Notification play failed', `${notificationKey}: ${getErrorMessage(error)}`, 2)
        return false
    }
}

// Play a random notification sound (1-78)
const playRandomNotification = (): Promise<boolean> => playNotification(pickRandomNotificationKey())

// Legacy function for backwards compatibility with general sounds
export const playSound = (soundName: string): Promise<boolean> => playByKey(soundName)

// Simple timer finished sound function
export const playTimerFinishedSound = (): Promise<boolean> => playByKey('timerFinished')

// New function to play period-based sounds
export const playPeriodSound = async (soundKey: string): Promise<boolean> => {
    await playRandomNotification()
    log('🔊 Playing period sound', soundKey, 10)
    return playByKey(soundKey)
}

// Helper to get sound key from sound path (for SoundScheduler integration)
export const getSoundKeyFromPath = (soundPath: string): string => {
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
