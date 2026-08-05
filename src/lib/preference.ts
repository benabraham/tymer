import { type Signal, signal } from '@preact/signals'

// Creates a localStorage-backed boolean signal with a toggle.
// When the key has never been set, falls back to `defaultValue`.
export const createTogglePreference = (
    key: string,
    defaultValue: boolean,
): { value: Signal<boolean>; toggle: () => void } => {
    const stored = localStorage.getItem(key)
    const initial = stored === null ? defaultValue : stored === 'true'
    const value = signal(initial)
    const toggle = () => {
        value.value = !value.value
        localStorage.setItem(key, String(value.value))
    }
    return { value, toggle }
}

// Creates a localStorage-backed signal restricted to a fixed set of options.
// A stored value outside `options` (e.g. removed at the source) falls back
// to `defaultValue` rather than leaving the app on a dead value.
export const createChoicePreference = <T extends string>(
    key: string,
    { options, defaultValue }: { options: T[]; defaultValue: T },
): { value: Signal<T>; set: (next: T) => void; cycle: () => void } => {
    const loadInitial = (): T => {
        try {
            const stored = localStorage.getItem(key)
            return stored !== null && (options as string[]).includes(stored)
                ? (stored as T)
                : defaultValue
        } catch {
            return defaultValue
        }
    }

    const value = signal(loadInitial())

    const set = (next: T) => {
        if (!options.includes(next)) return
        value.value = next
        try {
            localStorage.setItem(key, next)
        } catch {
            // Ignore storage failures — the in-memory value still applies.
        }
    }

    const cycle = () => {
        const currentIndex = options.indexOf(value.value)
        const nextIndex = (currentIndex + 1) % options.length
        set(options[nextIndex])
    }

    return { value, set, cycle }
}
