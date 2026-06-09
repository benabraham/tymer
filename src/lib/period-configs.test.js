import { describe, it, expect } from 'vitest'
import { parseConfigText, BUILTIN_CONFIG } from './period-configs'

const MIN = 60000

describe('parseConfigText', () => {
    it('parses the type/duration/note grammar from the spec', () => {
        const text = ['W 20    Note here', 'B   6', 'F 2:23'].join('\n')
        expect(parseConfigText(text)).toEqual([
            { type: 'work', durationMs: 20 * MIN, note: 'Note here' },
            { type: 'break', durationMs: 6 * MIN, note: '' },
            { type: 'fun', durationMs: (2 * 60 + 23) * MIN, note: '' },
        ])
    })

    it('treats a plain number as minutes and h:mm as hours:minutes', () => {
        expect(parseConfigText('W 90')[0].durationMs).toBe(90 * MIN)
        expect(parseConfigText('W 1:30')[0].durationMs).toBe(90 * MIN)
        expect(parseConfigText('W 1:05')[0].durationMs).toBe(65 * MIN)
    })

    it('is case-insensitive on the type token', () => {
        expect(parseConfigText('w 5\nb 5\nf 5').map(p => p.type)).toEqual(['work', 'break', 'fun'])
    })

    it('ignores empty lines and lines that cannot be parsed cleanly', () => {
        const text = [
            '',
            '   ',
            'W 20',
            'X 5', // bad type
            'W abc', // bad duration
            'W 1:2:3', // bad duration
            'B 6 keep me',
            'garbage',
        ].join('\n')
        expect(parseConfigText(text)).toEqual([
            { type: 'work', durationMs: 20 * MIN, note: '' },
            { type: 'break', durationMs: 6 * MIN, note: 'keep me' },
        ])
    })

    it('round-trips the built-in config back into periods', () => {
        const parsed = parseConfigText(BUILTIN_CONFIG.text)
        expect(parsed.length).toBeGreaterThan(0)
        expect(parsed[0]).toEqual({ type: 'work', durationMs: 24 * MIN, note: '' })
        expect(parsed[1]).toEqual({ type: 'break', durationMs: 6 * MIN, note: '' })
    })
})
