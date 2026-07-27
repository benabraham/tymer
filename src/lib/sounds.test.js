import { describe, it, expect } from 'vitest'
import { getVariantPaths } from './sounds.js'

describe('getVariantPaths', () => {
    it('uses the manifest paths when the key is present', () => {
        const paths = getVariantPaths('elapsed_6', ['/tymer/sounds/elapsed/006.webm'])

        expect(paths).toEqual(['/tymer/sounds/elapsed/006.webm'])
    })

    it('falls back to the hardcoded path when the key is absent from the manifest', () => {
        const paths = getVariantPaths('nonexistent_key', ['/tymer/sounds/fallback.webm'])

        expect(paths).toEqual(['/tymer/sounds/fallback.webm'])
    })
})
