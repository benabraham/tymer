import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { scanSoundManifest, pickVariant } from './generate-sound-manifest.js'

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
    it('maps a flat file to its key', () => {
        writeFile('elapsed/006.webm')

        const manifest = scanSoundManifest(tmpRoot)

        expect(manifest).toEqual({
            elapsed_6: ['/tymer/sounds/elapsed/006.webm'],
        })
    })

    it('collects all variants from a directory, sorted', () => {
        writeFile('elapsed/006/b.webm')
        writeFile('elapsed/006/a.webm')

        const manifest = scanSoundManifest(tmpRoot)

        expect(manifest).toEqual({
            elapsed_6: ['/tymer/sounds/elapsed/006/a.webm', '/tymer/sounds/elapsed/006/b.webm'],
        })
    })

    it('maps overtime/break files to overtime_break_N, not break_N', () => {
        writeFile('overtime/break/012.webm')

        const manifest = scanSoundManifest(tmpRoot)

        expect(manifest).toEqual({
            overtime_break_12: ['/tymer/sounds/overtime/break/012.webm'],
        })
    })

    it('maps timesup/work.webm to timesup_work', () => {
        writeFile('timesup/work.webm')

        const manifest = scanSoundManifest(tmpRoot)

        expect(manifest).toEqual({
            timesup_work: ['/tymer/sounds/timesup/work.webm'],
        })
    })

    it('maps notifications/01.ogg to notification_1', () => {
        writeFile('notifications/01.ogg')

        const manifest = scanSoundManifest(tmpRoot)

        expect(manifest).toEqual({
            notification_1: ['/tymer/sounds/notifications/01.ogg'],
        })
    })

    it('maps button.webm to button and timer-end.webm to timerFinished', () => {
        writeFile('button.webm')
        writeFile('timer-end.webm')

        const manifest = scanSoundManifest(tmpRoot)

        expect(manifest).toEqual({
            button: ['/tymer/sounds/button.webm'],
            timerFinished: ['/tymer/sounds/timer-end.webm'],
        })
    })

    it('ignores unrecognized files', () => {
        writeFile('scratch/aside.webm')
        writeFile('button-disabled.ogg')
        writeFile('README.md')

        const manifest = scanSoundManifest(tmpRoot)

        expect(manifest).toEqual({})
    })

    it('scans a mixed flat + directory layout across events', () => {
        writeFile('elapsed/006.webm')
        writeFile('remaining/012/a.webm')
        writeFile('remaining/012/b.webm')
        writeFile('overtime/break/018.webm')
        writeFile('button.webm')

        const manifest = scanSoundManifest(tmpRoot)

        expect(manifest).toEqual({
            elapsed_6: ['/tymer/sounds/elapsed/006.webm'],
            remaining_12: [
                '/tymer/sounds/remaining/012/a.webm',
                '/tymer/sounds/remaining/012/b.webm',
            ],
            overtime_break_18: ['/tymer/sounds/overtime/break/018.webm'],
            button: ['/tymer/sounds/button.webm'],
        })
    })
})
