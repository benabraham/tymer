import { createTogglePreference } from './preference'

export const { value: compactMode, toggle: toggleCompact } = createTogglePreference(
    'tymer-compact-mode',
    false,
)
