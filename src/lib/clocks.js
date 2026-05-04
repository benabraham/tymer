import { createTogglePreference } from './preference'

export const { value: clocksVisible, toggle: toggleClocks } = createTogglePreference(
    'tymer-clocks-visible',
    true,
)
