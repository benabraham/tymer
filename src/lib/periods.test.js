import { describe, it, expect } from 'vitest'
import { Periods } from './periods'

// Minimal Period-shaped fixtures. The pure-function tests only assert array
// shape and currentIndex — Period internals are not inspected here.
const p = id => ({ id })

describe('Periods.insert', () => {
    describe('currentIndex === null (timer not yet started)', () => {
        it('insert at head → currentIndex stays null', () => {
            const periods = [p('a'), p('b')]
            const result = Periods.insert({
                periods,
                currentIndex: null,
                atIndex: 0,
                period: p('x'),
            })
            expect(result.currentIndex).toBeNull()
            expect(result.periods).toEqual([p('x'), p('a'), p('b')])
        })

        it('insert at tail → currentIndex stays null', () => {
            const periods = [p('a'), p('b')]
            const result = Periods.insert({
                periods,
                currentIndex: null,
                atIndex: 2,
                period: p('x'),
            })
            expect(result.currentIndex).toBeNull()
            expect(result.periods).toEqual([p('a'), p('b'), p('x')])
        })

        it('insert in middle → currentIndex stays null', () => {
            const periods = [p('a'), p('b'), p('c')]
            const result = Periods.insert({
                periods,
                currentIndex: null,
                atIndex: 1,
                period: p('x'),
            })
            expect(result.currentIndex).toBeNull()
            expect(result.periods).toEqual([p('a'), p('x'), p('b'), p('c')])
        })
    })

    describe('insert at head (atIndex = 0)', () => {
        it('currentIndex = 0 (atIndex === currentIndex) → currentIndex shifts to 1', () => {
            const periods = [p('a'), p('b')]
            const result = Periods.insert({ periods, currentIndex: 0, atIndex: 0, period: p('x') })
            expect(result.currentIndex).toBe(1)
            expect(result.periods[0]).toEqual(p('x'))
            expect(result.periods[1]).toEqual(p('a'))
        })

        it('currentIndex = 1 (atIndex < currentIndex) → currentIndex shifts to 2', () => {
            const periods = [p('a'), p('b'), p('c')]
            const result = Periods.insert({ periods, currentIndex: 1, atIndex: 0, period: p('x') })
            expect(result.currentIndex).toBe(2)
            expect(result.periods[0]).toEqual(p('x'))
        })

        it('currentIndex = 2 (atIndex < currentIndex) → currentIndex shifts to 3', () => {
            const periods = [p('a'), p('b'), p('c')]
            const result = Periods.insert({ periods, currentIndex: 2, atIndex: 0, period: p('x') })
            expect(result.currentIndex).toBe(3)
        })
    })

    describe('insert at tail (atIndex = periods.length)', () => {
        it('currentIndex = 0 (atIndex > currentIndex) → currentIndex unchanged', () => {
            const periods = [p('a'), p('b')]
            const result = Periods.insert({ periods, currentIndex: 0, atIndex: 2, period: p('x') })
            expect(result.currentIndex).toBe(0)
            expect(result.periods).toEqual([p('a'), p('b'), p('x')])
        })

        it('currentIndex = 1 (atIndex > currentIndex) → currentIndex unchanged', () => {
            const periods = [p('a'), p('b'), p('c')]
            const result = Periods.insert({ periods, currentIndex: 1, atIndex: 3, period: p('x') })
            expect(result.currentIndex).toBe(1)
            expect(result.periods[3]).toEqual(p('x'))
        })
    })

    describe('insert in middle', () => {
        it('atIndex strictly less than currentIndex → currentIndex shifts +1', () => {
            // periods: [a, b, c], currentIndex = 2, insert at 1 → [a, x, b, c], currentIndex = 3
            const periods = [p('a'), p('b'), p('c')]
            const result = Periods.insert({ periods, currentIndex: 2, atIndex: 1, period: p('x') })
            expect(result.currentIndex).toBe(3)
            expect(result.periods).toEqual([p('a'), p('x'), p('b'), p('c')])
        })

        it('atIndex equal to currentIndex → currentIndex shifts +1', () => {
            // periods: [a, b, c], currentIndex = 1, insert at 1 → [a, x, b, c], currentIndex = 2
            const periods = [p('a'), p('b'), p('c')]
            const result = Periods.insert({ periods, currentIndex: 1, atIndex: 1, period: p('x') })
            expect(result.currentIndex).toBe(2)
            expect(result.periods).toEqual([p('a'), p('x'), p('b'), p('c')])
        })

        it('atIndex strictly greater than currentIndex → currentIndex unchanged', () => {
            // periods: [a, b, c], currentIndex = 0, insert at 2 → [a, b, x, c], currentIndex = 0
            const periods = [p('a'), p('b'), p('c')]
            const result = Periods.insert({ periods, currentIndex: 0, atIndex: 2, period: p('x') })
            expect(result.currentIndex).toBe(0)
            expect(result.periods).toEqual([p('a'), p('b'), p('x'), p('c')])
        })
    })

    describe('edge cases', () => {
        it('empty array — insert at 0 → single-element array, currentIndex stays null', () => {
            const result = Periods.insert({
                periods: [],
                currentIndex: null,
                atIndex: 0,
                period: p('x'),
            })
            expect(result.periods).toEqual([p('x')])
            expect(result.currentIndex).toBeNull()
        })

        it('single-element array — insert before it (atIndex = 0, currentIndex = 0) → currentIndex = 1', () => {
            const result = Periods.insert({
                periods: [p('a')],
                currentIndex: 0,
                atIndex: 0,
                period: p('x'),
            })
            expect(result.periods).toEqual([p('x'), p('a')])
            expect(result.currentIndex).toBe(1)
        })

        it('single-element array — insert after it (atIndex = 1, currentIndex = 0) → currentIndex = 0', () => {
            const result = Periods.insert({
                periods: [p('a')],
                currentIndex: 0,
                atIndex: 1,
                period: p('x'),
            })
            expect(result.periods).toEqual([p('a'), p('x')])
            expect(result.currentIndex).toBe(0)
        })

        it('input array is not mutated', () => {
            const periods = [p('a'), p('b')]
            Periods.insert({ periods, currentIndex: 0, atIndex: 0, period: p('x') })
            expect(periods).toEqual([p('a'), p('b')])
        })
    })
})

describe('Periods.insertMakingCurrent', () => {
    it('currentIndex is always set to atIndex (input currentIndex ignored)', () => {
        const periods = [p('a'), p('b'), p('c')]
        const result = Periods.insertMakingCurrent({
            periods,
            currentIndex: 2,
            atIndex: 1,
            period: p('x'),
        })
        expect(result.currentIndex).toBe(1)
    })

    it('even when input currentIndex is null, result is atIndex', () => {
        const periods = [p('a'), p('b')]
        const result = Periods.insertMakingCurrent({
            periods,
            currentIndex: null,
            atIndex: 0,
            period: p('x'),
        })
        expect(result.currentIndex).toBe(0)
    })

    it('insert at head (atIndex = 0) → currentIndex = 0', () => {
        const periods = [p('a'), p('b')]
        const result = Periods.insertMakingCurrent({
            periods,
            currentIndex: 1,
            atIndex: 0,
            period: p('x'),
        })
        expect(result.currentIndex).toBe(0)
        expect(result.periods).toEqual([p('x'), p('a'), p('b')])
    })

    it('insert at tail (atIndex = periods.length) → currentIndex = length', () => {
        const periods = [p('a'), p('b')]
        const result = Periods.insertMakingCurrent({
            periods,
            currentIndex: 0,
            atIndex: 2,
            period: p('x'),
        })
        expect(result.currentIndex).toBe(2)
        expect(result.periods).toEqual([p('a'), p('b'), p('x')])
    })

    it('insert in middle → currentIndex = atIndex', () => {
        const periods = [p('a'), p('b'), p('c')]
        const result = Periods.insertMakingCurrent({
            periods,
            currentIndex: 0,
            atIndex: 2,
            period: p('x'),
        })
        expect(result.currentIndex).toBe(2)
        expect(result.periods).toEqual([p('a'), p('b'), p('x'), p('c')])
    })

    it('array shape is correct — period appears at atIndex', () => {
        const periods = [p('a'), p('b'), p('c')]
        const result = Periods.insertMakingCurrent({
            periods,
            currentIndex: 0,
            atIndex: 1,
            period: p('x'),
        })
        expect(result.periods[1]).toEqual(p('x'))
        expect(result.periods).toHaveLength(4)
    })

    it('input array is not mutated', () => {
        const periods = [p('a'), p('b')]
        Periods.insertMakingCurrent({ periods, currentIndex: 0, atIndex: 1, period: p('x') })
        expect(periods).toEqual([p('a'), p('b')])
    })
})

describe('Periods.remove', () => {
    describe('currentIndex === null', () => {
        it('remove at head → currentIndex stays null', () => {
            const periods = [p('a'), p('b'), p('c')]
            const result = Periods.remove({ periods, currentIndex: null, indexToRemove: 0 })
            expect(result.currentIndex).toBeNull()
            expect(result.periods).toEqual([p('b'), p('c')])
        })

        it('remove at tail → currentIndex stays null', () => {
            const periods = [p('a'), p('b'), p('c')]
            const result = Periods.remove({ periods, currentIndex: null, indexToRemove: 2 })
            expect(result.currentIndex).toBeNull()
            expect(result.periods).toEqual([p('a'), p('b')])
        })

        it('remove in middle → currentIndex stays null', () => {
            const periods = [p('a'), p('b'), p('c')]
            const result = Periods.remove({ periods, currentIndex: null, indexToRemove: 1 })
            expect(result.currentIndex).toBeNull()
            expect(result.periods).toEqual([p('a'), p('c')])
        })
    })

    describe('remove at head (indexToRemove = 0)', () => {
        it('currentIndex = 1 (indexToRemove < currentIndex) → currentIndex shifts to 0', () => {
            const periods = [p('a'), p('b'), p('c')]
            const result = Periods.remove({ periods, currentIndex: 1, indexToRemove: 0 })
            expect(result.currentIndex).toBe(0)
            expect(result.periods).toEqual([p('b'), p('c')])
        })

        it('currentIndex = 2 (indexToRemove < currentIndex) → currentIndex shifts to 1', () => {
            const periods = [p('a'), p('b'), p('c')]
            const result = Periods.remove({ periods, currentIndex: 2, indexToRemove: 0 })
            expect(result.currentIndex).toBe(1)
            expect(result.periods).toEqual([p('b'), p('c')])
        })
    })

    describe('remove at tail (indexToRemove = periods.length - 1)', () => {
        it('currentIndex = 0 (indexToRemove > currentIndex) → currentIndex unchanged', () => {
            const periods = [p('a'), p('b'), p('c')]
            const result = Periods.remove({ periods, currentIndex: 0, indexToRemove: 2 })
            expect(result.currentIndex).toBe(0)
            expect(result.periods).toEqual([p('a'), p('b')])
        })

        it('currentIndex = 1 (indexToRemove > currentIndex) → currentIndex unchanged', () => {
            const periods = [p('a'), p('b'), p('c')]
            const result = Periods.remove({ periods, currentIndex: 1, indexToRemove: 2 })
            expect(result.currentIndex).toBe(1)
            expect(result.periods).toEqual([p('a'), p('b')])
        })
    })

    describe('remove in middle', () => {
        it('indexToRemove strictly less than currentIndex → currentIndex shifts -1', () => {
            // periods: [a, b, c, d], currentIndex = 3, remove index 1 → [a, c, d], currentIndex = 2
            const periods = [p('a'), p('b'), p('c'), p('d')]
            const result = Periods.remove({ periods, currentIndex: 3, indexToRemove: 1 })
            expect(result.currentIndex).toBe(2)
            expect(result.periods).toEqual([p('a'), p('c'), p('d')])
        })

        it('indexToRemove strictly greater than currentIndex → currentIndex unchanged', () => {
            // periods: [a, b, c, d], currentIndex = 0, remove index 2 → [a, b, d], currentIndex = 0
            const periods = [p('a'), p('b'), p('c'), p('d')]
            const result = Periods.remove({ periods, currentIndex: 0, indexToRemove: 2 })
            expect(result.currentIndex).toBe(0)
            expect(result.periods).toEqual([p('a'), p('b'), p('d')])
        })

        it('remove item directly after currentIndex → currentIndex unchanged', () => {
            // periods: [a, b, c], currentIndex = 1, remove index 2 → [a, b], currentIndex = 1
            const periods = [p('a'), p('b'), p('c')]
            const result = Periods.remove({ periods, currentIndex: 1, indexToRemove: 2 })
            expect(result.currentIndex).toBe(1)
            expect(result.periods).toEqual([p('a'), p('b')])
        })
    })

    describe('edge cases', () => {
        it('single-item array (removing only period) — array becomes empty', () => {
            const result = Periods.remove({
                periods: [p('a')],
                currentIndex: null,
                indexToRemove: 0,
            })
            expect(result.periods).toEqual([])
            expect(result.currentIndex).toBeNull()
        })

        it('input array is not mutated', () => {
            const periods = [p('a'), p('b'), p('c')]
            Periods.remove({ periods, currentIndex: 1, indexToRemove: 2 })
            expect(periods).toHaveLength(3)
        })
    })
})
