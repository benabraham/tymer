import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createChoicePreference } from './preference.js'

describe('createChoicePreference', () => {
    beforeEach(() => {
        vi.mocked(localStorage.getItem).mockReset()
        vi.mocked(localStorage.setItem).mockReset()
    })

    it('defaults to defaultValue when nothing is stored', () => {
        vi.mocked(localStorage.getItem).mockReturnValue(null)

        const { value } = createChoicePreference('testChoice', {
            options: ['a', 'b', 'c'],
            defaultValue: 'a',
        })

        expect(value.value).toBe('a')
    })

    it('uses the stored value when it is a valid option', () => {
        vi.mocked(localStorage.getItem).mockReturnValue('b')

        const { value } = createChoicePreference('testChoice', {
            options: ['a', 'b', 'c'],
            defaultValue: 'a',
        })

        expect(value.value).toBe('b')
    })

    it('falls back to defaultValue when the stored value is no longer a valid option', () => {
        vi.mocked(localStorage.getItem).mockReturnValue('removed-option')

        const { value } = createChoicePreference('testChoice', {
            options: ['a', 'b', 'c'],
            defaultValue: 'a',
        })

        expect(value.value).toBe('a')
    })

    it('set() writes a valid option to the signal and localStorage', () => {
        vi.mocked(localStorage.getItem).mockReturnValue(null)

        const { value, set } = createChoicePreference('testChoice', {
            options: ['a', 'b', 'c'],
            defaultValue: 'a',
        })

        set('c')

        expect(value.value).toBe('c')
        expect(localStorage.setItem).toHaveBeenCalledWith('testChoice', 'c')
    })

    it('set() ignores a value outside options', () => {
        vi.mocked(localStorage.getItem).mockReturnValue(null)

        const { value, set } = createChoicePreference('testChoice', {
            options: ['a', 'b', 'c'],
            defaultValue: 'a',
        })

        // Exercises the runtime guard against a value TS wouldn't normally
        // allow through `set`'s `T` — e.g. a stale caller or non-TS data source.
        set('nonexistent' as 'a' | 'b' | 'c')

        expect(value.value).toBe('a')
        expect(localStorage.setItem).not.toHaveBeenCalled()
    })

    it('cycle() advances to the next option and wraps past the end', () => {
        vi.mocked(localStorage.getItem).mockReturnValue('c')

        const { value, cycle } = createChoicePreference('testChoice', {
            options: ['a', 'b', 'c'],
            defaultValue: 'a',
        })

        expect(value.value).toBe('c')
        cycle()
        expect(value.value).toBe('a')
        cycle()
        expect(value.value).toBe('b')
    })

    it('falls back to defaultValue when localStorage.getItem throws (private mode)', () => {
        vi.mocked(localStorage.getItem).mockImplementation(() => {
            throw new Error('storage disabled')
        })

        const { value } = createChoicePreference('testChoice', {
            options: ['a', 'b', 'c'],
            defaultValue: 'a',
        })

        expect(value.value).toBe('a')
    })

    it('set() still updates the signal when localStorage.setItem throws', () => {
        vi.mocked(localStorage.getItem).mockReturnValue(null)
        vi.mocked(localStorage.setItem).mockImplementation(() => {
            throw new Error('storage disabled')
        })

        const { value, set } = createChoicePreference('testChoice', {
            options: ['a', 'b', 'c'],
            defaultValue: 'a',
        })

        set('b')

        expect(value.value).toBe('b')
    })
})
