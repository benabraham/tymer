import { createChoicePreference } from './preference.js'
import { SOUND_SETS } from './sound-manifest.js'

// The pool-wide option — no filtering, today's behavior.
export const ALL_SETS = 'all'

export const soundSetOptions = [ALL_SETS, ...SOUND_SETS]

const { value: activeSoundSet, cycle: cycleSoundSet } = createChoicePreference('soundSet', {
    options: soundSetOptions,
    defaultValue: ALL_SETS,
})

export { activeSoundSet, cycleSoundSet }

// Capitalize-first-letter display label, computed rather than a hand-maintained
// map so a fifth voice promoted later appears with no code edit.
export const soundSetLabel = (name: string): string => name.charAt(0).toUpperCase() + name.slice(1)
