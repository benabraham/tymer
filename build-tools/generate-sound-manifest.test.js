import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { pickVariant, scanSoundManifest } from './generate-sound-manifest.js'

describe('pickVariant', () => {
    it('always returns index 0 with a single variant', () => {
        const variants = ['only.webm']

        for (let i = 0; i < 5; i++) {
            expect(pickVariant(variants, 0)).toBe(0)
        }
    })

    it('never returns lastIndex with 3 variants', () => {
        const variants = ['a.webm', 'b.webm', 'c.webm']

        for (let lastIndex = 0; lastIndex < 3; lastIndex++) {
            for (let i = 0; i < 50; i++) {
                expect(pickVariant(variants, lastIndex)).not.toBe(lastIndex)
            }
        }
    })

    it('eventually picks all 3 indices as Math.random sweeps 0..1', () => {
        const variants = ['a.webm', 'b.webm', 'c.webm']
        const seen = new Set()
        const randomSpy = vi.spyOn(Math, 'random')

        try {
            // Deterministically sweep the full [0, 1) range Math.random can produce,
            // pairing each draw with every possible lastIndex.
            for (const randomValue of [0, 0.1, 0.34, 0.5, 0.67, 0.9, 0.99]) {
                for (let lastIndex = 0; lastIndex < 3; lastIndex++) {
                    randomSpy.mockReturnValueOnce(randomValue)
                    seen.add(pickVariant(variants, lastIndex))
                }
            }
        } finally {
            randomSpy.mockRestore()
        }

        expect(seen).toEqual(new Set([0, 1, 2]))
    })
})

let tmpRoot

const writeFile = relativePath => {
    const full = path.join(tmpRoot, relativePath)
    fs.mkdirSync(path.dirname(full), { recursive: true })
    fs.writeFileSync(full, '')
}

beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sound-manifest-'))
})

afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true })
})

describe('scanSoundManifest', () => {
    it('maps a flat file to its key, with a null set', () => {
        writeFile('elapsed/006.webm')

        const { variants, sets } = scanSoundManifest(tmpRoot)

        expect(variants).toEqual({
            elapsed_6: [{ src: '/tymer/sounds/elapsed/006.webm', set: null }],
        })
        expect(sets).toEqual([])
    })

    it('collects all variants from a directory, sorted, with the take-dir set derived per file', () => {
        writeFile('elapsed/006/b.webm')
        writeFile('elapsed/006/a.webm')

        const { variants, sets } = scanSoundManifest(tmpRoot)

        expect(variants).toEqual({
            elapsed_6: [
                { src: '/tymer/sounds/elapsed/006/a.webm', set: 'a' },
                { src: '/tymer/sounds/elapsed/006/b.webm', set: 'b' },
            ],
        })
        expect(sets).toEqual(['a', 'b'])
    })

    it('strips a trailing -<digits> take suffix from the set name', () => {
        writeFile('elapsed/006/brisk-1.webm')
        writeFile('elapsed/006/brisk-2.webm')

        const { variants, sets } = scanSoundManifest(tmpRoot)

        expect(variants.elapsed_6.map(v => v.set)).toEqual(['brisk', 'brisk'])
        expect(sets).toEqual(['brisk'])
    })

    it('maps overtime/break files to overtime_break_N, not break_N, with a null set for the flat layout', () => {
        writeFile('overtime/break/012.webm')

        const { variants, sets } = scanSoundManifest(tmpRoot)

        expect(variants).toEqual({
            overtime_break_12: [{ src: '/tymer/sounds/overtime/break/012.webm', set: null }],
        })
        expect(sets).toEqual([])
    })

    it('derives a set for overtime/break take-dir files', () => {
        writeFile('overtime/break/012/hush-1.webm')

        const { variants, sets } = scanSoundManifest(tmpRoot)

        expect(variants).toEqual({
            overtime_break_12: [
                { src: '/tymer/sounds/overtime/break/012/hush-1.webm', set: 'hush' },
            ],
        })
        expect(sets).toEqual(['hush'])
    })

    it('maps elapsed/break and remaining/break take-dir files to their _break_ keys', () => {
        writeFile('elapsed/break/006/tube-1.webm')
        writeFile('remaining/break/012/tube-1.webm')

        const { variants, sets } = scanSoundManifest(tmpRoot)

        expect(variants).toEqual({
            elapsed_break_6: [{ src: '/tymer/sounds/elapsed/break/006/tube-1.webm', set: 'tube' }],
            remaining_break_12: [
                { src: '/tymer/sounds/remaining/break/012/tube-1.webm', set: 'tube' },
            ],
        })
        expect(sets).toEqual(['tube'])
    })

    it('maps deadline take-dir files to deadline_N', () => {
        writeFile('deadline/060/tube-1.webm')

        const { variants, sets } = scanSoundManifest(tmpRoot)

        expect(variants).toEqual({
            deadline_60: [{ src: '/tymer/sounds/deadline/060/tube-1.webm', set: 'tube' }],
        })
        expect(sets).toEqual(['tube'])
    })

    it('maps timesup/work.webm to timesup_work with a null set', () => {
        writeFile('timesup/work.webm')

        const { variants, sets } = scanSoundManifest(tmpRoot)

        expect(variants).toEqual({
            timesup_work: [{ src: '/tymer/sounds/timesup/work.webm', set: null }],
        })
        expect(sets).toEqual([])
    })

    it('derives a set for timesup take-dir files', () => {
        writeFile('timesup/work/strict-1.webm')

        const { variants, sets } = scanSoundManifest(tmpRoot)

        expect(variants).toEqual({
            timesup_work: [{ src: '/tymer/sounds/timesup/work/strict-1.webm', set: 'strict' }],
        })
        expect(sets).toEqual(['strict'])
    })

    it('maps notifications/01.ogg to notification_1 with a null set', () => {
        writeFile('notifications/01.ogg')

        const { variants, sets } = scanSoundManifest(tmpRoot)

        expect(variants).toEqual({
            notification_1: [{ src: '/tymer/sounds/notifications/01.ogg', set: null }],
        })
        expect(sets).toEqual([])
    })

    it('maps button.webm to button and timer-end.webm to timerFinished, both null set', () => {
        writeFile('button.webm')
        writeFile('timer-end.webm')

        const { variants, sets } = scanSoundManifest(tmpRoot)

        expect(variants).toEqual({
            button: [{ src: '/tymer/sounds/button.webm', set: null }],
            timerFinished: [{ src: '/tymer/sounds/timer-end.webm', set: null }],
        })
        expect(sets).toEqual([])
    })

    it('ignores unrecognized files', () => {
        writeFile('scratch/aside.webm')
        writeFile('button-disabled.ogg')
        writeFile('README.md')

        const { variants, sets } = scanSoundManifest(tmpRoot)

        expect(variants).toEqual({})
        expect(sets).toEqual([])
    })

    it('scans a mixed flat + directory layout across events, collecting all sets found', () => {
        writeFile('elapsed/006.webm')
        writeFile('remaining/012/brisk-1.webm')
        writeFile('remaining/012/hush-1.webm')
        writeFile('overtime/break/018.webm')
        writeFile('button.webm')

        const { variants, sets } = scanSoundManifest(tmpRoot)

        expect(variants).toEqual({
            elapsed_6: [{ src: '/tymer/sounds/elapsed/006.webm', set: null }],
            remaining_12: [
                { src: '/tymer/sounds/remaining/012/brisk-1.webm', set: 'brisk' },
                { src: '/tymer/sounds/remaining/012/hush-1.webm', set: 'hush' },
            ],
            overtime_break_18: [{ src: '/tymer/sounds/overtime/break/018.webm', set: null }],
            button: [{ src: '/tymer/sounds/button.webm', set: null }],
        })
        expect(sets).toEqual(['brisk', 'hush'])
    })
})
