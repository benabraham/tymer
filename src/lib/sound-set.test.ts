import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('sound-set', () => {
    beforeEach(() => {
        vi.mocked(localStorage.getItem).mockReset()
        vi.mocked(localStorage.setItem).mockReset()
        vi.resetModules()
    })

    it('soundSetOptions is ["all", ...SOUND_SETS]', async () => {
        const { soundSetOptions, ALL_SETS } = await import('./sound-set.js')
        const { SOUND_SETS } = await import('./sound-manifest.js')

        expect(soundSetOptions).toEqual([ALL_SETS, ...SOUND_SETS])
    })

    it('defaults activeSoundSet to "all" when nothing is stored', async () => {
        vi.mocked(localStorage.getItem).mockReturnValue(null)
        const { activeSoundSet, ALL_SETS } = await import('./sound-set.js')

        expect(activeSoundSet.value).toBe(ALL_SETS)
        expect(ALL_SETS).toBe('all')
    })

    it('falls back to "all" when the stored value is not a known option', async () => {
        vi.mocked(localStorage.getItem).mockReturnValue('garbage-set-name')
        const { activeSoundSet, ALL_SETS } = await import('./sound-set.js')

        expect(activeSoundSet.value).toBe(ALL_SETS)
    })

    it('cycleSoundSet walks every option and wraps back to "all"', async () => {
        vi.mocked(localStorage.getItem).mockReturnValue(null)
        const { activeSoundSet, cycleSoundSet, soundSetOptions } = await import('./sound-set.js')

        const seen = [activeSoundSet.value]
        for (let i = 0; i < soundSetOptions.length; i++) {
            cycleSoundSet()
            seen.push(activeSoundSet.value)
        }

        // Walks every option exactly once, then wraps back to the start.
        expect(seen).toEqual([...soundSetOptions, soundSetOptions[0]])
    })

    it('soundSetLabel capitalizes the first letter of an option, including "all"', async () => {
        const { soundSetLabel } = await import('./sound-set.js')

        expect(soundSetLabel('all')).toBe('All')
        expect(soundSetLabel('brisk')).toBe('Brisk')
        expect(soundSetLabel('whisper')).toBe('Whisper')
    })
})
