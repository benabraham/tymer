import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { getVariantPaths, playSound, soundPlaybackLog, REQUIRED_SOUND_KEYS } from './sounds.js'
import { SOUND_VARIANTS } from './sound-manifest.js'

describe('getVariantPaths', () => {
    it('uses the manifest paths when the key is present', () => {
        // Asserted against the manifest rather than a literal path: which set is
        // promoted decides both the filenames and the layout (flat `006.webm` vs
        // `006/<take>.webm`), so a literal here fails the next time the bank is
        // replaced.
        const paths = getVariantPaths('elapsed_6')

        expect(paths).toEqual(SOUND_VARIANTS['elapsed_6'])
    })

    it('returns an empty array when the key is absent from the manifest', () => {
        const paths = getVariantPaths('nonexistent_key')

        expect(paths).toEqual([])
    })
})

describe('playSound', () => {
    it('resolves to false and logs a not-found entry for a key with no variants', async () => {
        const result = await playSound('nonexistent_key')

        expect(result).toBe(false)
        expect(soundPlaybackLog[0]).toMatchObject({
            soundKey: 'nonexistent_key',
            success: false,
            error: 'Sound not found',
        })
    })
})

// Regression guard, not a red-green spec — green from the start by
// construction; this is what would have caught commit 5b7959f, where
// public/sounds/ moved from flat files to per-event take directories but the
// hardcoded fallback paths in sounds.js were never updated, leaving every
// fallback pointing at a 404.
describe('SOUND_VARIANTS regression guard', () => {
    const repoRoot = path.resolve(import.meta.dirname, '../..')

    it('has a non-empty manifest entry for every required sound key', () => {
        REQUIRED_SOUND_KEYS.forEach(key => {
            expect(SOUND_VARIANTS[key], `missing manifest entry for "${key}"`).toBeDefined()
            expect(SOUND_VARIANTS[key].length, `no variants for "${key}"`).toBeGreaterThan(0)
        })
    })

    it('has every manifest path present on disk', () => {
        const allPaths = Object.values(SOUND_VARIANTS).flat()

        allPaths.forEach(urlPath => {
            const relativePath = urlPath.replace('/tymer/sounds/', 'public/sounds/')
            const absolutePath = path.join(repoRoot, relativePath)

            expect(fs.existsSync(absolutePath), `missing file for "${urlPath}"`).toBe(true)
        })
    })
})
