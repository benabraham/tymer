import { describe, it, expect } from 'vitest'
import { AVAILABLE_SOUNDS } from './sound-discovery'

describe('AVAILABLE_SOUNDS.overtime', () => {
    it('does not contain 60 and its max is 48', () => {
        expect(AVAILABLE_SOUNDS.overtime).not.toContain(60)
        expect(Math.max(...AVAILABLE_SOUNDS.overtime)).toBe(48)
    })
})
