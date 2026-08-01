import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createChoicePreference } from './preference.js'

describe('createChoicePreference', () => {
    beforeEach(() => {
        localStorage.getItem.mockReset()
        localStorage.setItem.mockReset()
    })

    it('defaults to defaultValue when nothing is stored', () => {
        localStorage.getItem.mockReturnValue(null)

        const { value } = createChoicePreference('testChoice', {
            options: ['a', 'b', 'c'],
            defaultValue: 'a',
        })

        expect(value.value).toBe('a')
    })

    it('uses the stored value when it is a valid option', () => {
        localStorage.getItem.mockReturnValue('b')

        const { value } = createChoicePreference('testChoice', {
            options: ['a', 'b', 'c'],
            defaultValue: 'a',
        })

        expect(value.value).toBe('b')
    })

    it('falls back to defaultValue when the stored value is no longer a valid option', () => {
        localStorage.getItem.mockReturnValue('removed-option')

        const { value } = createChoicePreference('testChoice', {
            options: ['a', 'b', 'c'],
            defaultValue: 'a',
        })

        expect(value.value).toBe('a')
    })

    it('set() writes a valid option to the signal and localStorage', () => {
        localStorage.getItem.mockReturnValue(null)

        const { value, set } = createChoicePreference('testChoice', {
            options: ['a', 'b', 'c'],
            defaultValue: 'a',
        })

        set('c')

        expect(value.value).toBe('c')
        expect(localStorage.setItem).toHaveBeenCalledWith('testChoice', 'c')
    })

    it('set() ignores a value outside options', () => {
        localStorage.getItem.mockReturnValue(null)

        const { value, set } = createChoicePreference('testChoice', {
            options: ['a', 'b', 'c'],
            defaultValue: 'a',
        })

        set('nonexistent')

        expect(value.value).toBe('a')
        expect(localStorage.setItem).not.toHaveBeenCalled()
    })

    it('cycle() advances to the next option and wraps past the end', () => {
        localStorage.getItem.mockReturnValue('c')

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
        localStorage.getItem.mockImplementation(() => {
            throw new Error('storage disabled')
        })

        const { value } = createChoicePreference('testChoice', {
            options: ['a', 'b', 'c'],
            defaultValue: 'a',
        })

        expect(value.value).toBe('a')
    })

    it('set() still updates the signal when localStorage.setItem throws', () => {
        localStorage.getItem.mockReturnValue(null)
        localStorage.setItem.mockImplementation(() => {
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
