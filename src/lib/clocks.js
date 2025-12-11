import { signal } from '@preact/signals'

const CLOCKS_KEY = 'tymer-clocks-visible'

export const clocksVisible = signal(localStorage.getItem(CLOCKS_KEY) !== 'false')

export const toggleClocks = () => {
    clocksVisible.value = !clocksVisible.value
    localStorage.setItem(CLOCKS_KEY, clocksVisible.value)
}
