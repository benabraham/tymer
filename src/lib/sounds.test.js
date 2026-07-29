import { describe, it, expect } from 'vitest'
import { getVariantPaths } from './sounds.js'
import { SOUND_VARIANTS } from './sound-manifest.js'

describe('getVariantPaths', () => {
    it('uses the manifest paths when the key is present', () => {
        // Asserted against the manifest rather than a literal path: which set is
        // promoted decides both the filenames and the layout (flat `006.webm` vs
        // `006/<take>.webm`), so a literal here fails the next time the bank is
        // replaced. It also has to differ from the fallback — an earlier version
        // passed the manifest's own path as the fallback, which meant the
        // assertion held whichever branch ran.
        const fallback = ['/tymer/sounds/unused-fallback.webm']
        const paths = getVariantPaths('elapsed_6', fallback)

        expect(paths).toEqual(SOUND_VARIANTS['elapsed_6'])
        expect(paths).not.toEqual(fallback)
    })

    it('falls back to the hardcoded path when the key is absent from the manifest', () => {
        const paths = getVariantPaths('nonexistent_key', ['/tymer/sounds/fallback.webm'])

        expect(paths).toEqual(['/tymer/sounds/fallback.webm'])
    })
})
