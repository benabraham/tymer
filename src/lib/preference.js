import { signal } from '@preact/signals'

// Creates a localStorage-backed boolean signal with a toggle.
// When the key has never been set, falls back to `defaultValue`.
export const createTogglePreference = (key, defaultValue) => {
    const stored = localStorage.getItem(key)
    const initial = stored === null ? defaultValue : stored === 'true'
    const value = signal(initial)
    const toggle = () => {
        value.value = !value.value
        localStorage.setItem(key, String(value.value))
    }
    return { value, toggle }
}
