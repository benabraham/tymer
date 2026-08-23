import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { SOUND_SETS, SOUND_VARIANTS } from './sound-manifest.js'
import { ALL_SETS } from './sound-set.js'
import {
    getVariantPaths,
    pickCandidates,
    playSound,
    REQUIRED_SOUND_KEYS,
    soundPlaybackLog,
} from './sounds.js'

describe('getVariantPaths', () => {
    it('uses the manifest paths when the key is present', () => {
        // Asserted against the manifest rather than a literal path: which set is
        // promoted decides both the filenames and the layout (flat `006.webm` vs
        // `006/<take>.webm`), so a literal here fails the next time the bank is
        // replaced.
        const paths = getVariantPaths('elapsed_6')

        expect(paths).toEqual(SOUND_VARIANTS['elapsed_6'].map(v => v.src))
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
        const allVariants = Object.values(SOUND_VARIANTS).flat()

        allVariants.forEach(({ src: urlPath }) => {
            const relativePath = urlPath.replace('/tymer/sounds/', 'public/sounds/')
            const absolutePath = path.join(repoRoot, relativePath)

            expect(fs.existsSync(absolutePath), `missing file for "${urlPath}"`).toBe(true)
        })
    })

    // Catches a half-promoted set (missing takes for some speech keys) and a
    // prompt-set that forgot its @name directive, which would otherwise
    // produce a per-clip pseudo-set derived from the text filename instead of
    // a real set covering every speech key.
    it('has every SOUND_SETS entry covering every speech key', () => {
        const nonSpeechKeys = new Set(['button', 'timerFinished'])
        const speechKeys = REQUIRED_SOUND_KEYS.filter(
            key => !nonSpeechKeys.has(key) && !key.startsWith('notification_'),
        )

        SOUND_SETS.forEach(set => {
            speechKeys.forEach(key => {
                const hasTakeForSet = (SOUND_VARIANTS[key] ?? []).some(v => v.set === set)
                expect(hasTakeForSet, `set "${set}" missing a take for "${key}"`).toBe(true)
            })
        })
    })
})

describe('pickCandidates', () => {
    const variants = [
        { src: 'a.webm', set: 'brisk' },
        { src: 'b.webm', set: 'tube' },
        { src: 'c.webm', set: null },
    ]

    it('returns all variants unchanged when set is ALL_SETS', () => {
        expect(pickCandidates({ variants, set: ALL_SETS })).toEqual(variants)
    })

    it('returns only variants matching the given set', () => {
        expect(pickCandidates({ variants, set: 'brisk' })).toEqual([
            { src: 'a.webm', set: 'brisk' },
        ])
    })

    // Load-bearing fallback: set-less keys (button, the 78 notifications,
    // timerFinished) have no variant matching any named set, so filtering
    // would empty the list and silence them entirely. A half-generated set
    // (missing a take for some key) would do the same for a speech key. In
    // both cases falling back to the full pool is strictly better than the
    // silent-404-Howl trap CLAUDE.md documents — the event still plays,
    // just without the set restriction for that one key.
    it('falls back to all variants when filtering by set matches nothing', () => {
        const setless = [{ src: 'button.webm', set: null }]

        expect(pickCandidates({ variants: setless, set: 'brisk' })).toEqual(setless)
    })
})
