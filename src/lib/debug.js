import { signal } from '@preact/signals'

const DEBUG_KEY = 'tymer-debug-visible'

export const debugVisible = signal(localStorage.getItem(DEBUG_KEY) === 'true')

export const toggleDebug = () => {
    debugVisible.value = !debugVisible.value
    localStorage.setItem(DEBUG_KEY, debugVisible.value)
}
