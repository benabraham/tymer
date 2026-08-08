import { describe, expect, it } from 'vitest'
import { AVAILABLE_SOUNDS, DEADLINE_WARNING_MINUTES } from './sound-discovery'

describe('AVAILABLE_SOUNDS.overtime', () => {
    it('does not contain 60 and its max is 48', () => {
        expect(AVAILABLE_SOUNDS.overtime).not.toContain(60)
        expect(Math.max(...AVAILABLE_SOUNDS.overtime)).toBe(48)
    })
})

describe('AVAILABLE_SOUNDS break-specific banks', () => {
    it('has elapsedBreak at 6 and 12 minutes', () => {
        expect(AVAILABLE_SOUNDS.elapsedBreak).toEqual([6, 12])
    })

    it('has remainingBreak at 6 and 12 minutes', () => {
        expect(AVAILABLE_SOUNDS.remainingBreak).toEqual([6, 12])
    })
})

describe('DEADLINE_WARNING_MINUTES', () => {
    it('warns at 60, 12 and 6 minutes before a deadline', () => {
        expect(DEADLINE_WARNING_MINUTES).toEqual([60, 12, 6])
    })
})
