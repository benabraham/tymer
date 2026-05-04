import { createTogglePreference } from './preference'

export const { value: debugVisible, toggle: toggleDebug } = createTogglePreference(
    'tymer-debug-visible',
    false,
)
