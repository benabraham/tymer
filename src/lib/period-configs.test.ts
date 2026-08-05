import { describe, expect, it } from 'vitest'
import { BUILTIN_CONFIG, parseConfigAnchor, parseConfigText } from './period-configs'

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

    it('ignores an anchor line mixed among period lines, leaving surrounding periods intact', () => {
        const text = ['W 20', '@9:00', 'B 6'].join('\n')
        expect(parseConfigText(text)).toEqual([
            { type: 'work', durationMs: 20 * MIN, note: '' },
            { type: 'break', durationMs: 6 * MIN, note: '' },
        ])
    })
})

describe('parseConfigAnchor', () => {
    it('parses a valid @h:mm anchor line to minutes-since-midnight', () => {
        expect(parseConfigAnchor('@9:00')).toBe(540)
    })

    it('allows a leading space after @ and unpadded/padded minutes', () => {
        expect(parseConfigAnchor('@ 9:00')).toBe(540)
        expect(parseConfigAnchor('@09:5')).toBe(545)
        expect(parseConfigAnchor('@0:00')).toBe(0)
        expect(parseConfigAnchor('@23:59')).toBe(1439)
    })

    it('returns null for invalid anchor forms and absent anchors', () => {
        expect(parseConfigAnchor('@')).toBeNull()
        expect(parseConfigAnchor('@9')).toBeNull()
        expect(parseConfigAnchor('@9:')).toBeNull()
        expect(parseConfigAnchor('@24:00')).toBeNull()
        expect(parseConfigAnchor('@9:60')).toBeNull()
        expect(parseConfigAnchor('@9:00 extra')).toBeNull()
        expect(parseConfigAnchor('x@9:00')).toBeNull()
        expect(parseConfigAnchor('W 20\nB 6')).toBeNull()
    })

    it('uses the first valid anchor line when multiple are present', () => {
        expect(parseConfigAnchor(['@9:00', '@10:00'].join('\n'))).toBe(540)
    })

    it('skips an invalid-shaped anchor line and uses the next valid one', () => {
        expect(parseConfigAnchor(['@24:00', '@9:00'].join('\n'))).toBe(540)
    })

    it('parses out an anchor line mixed in among period lines', () => {
        const text = ['W 20', '@9:00', 'B 6'].join('\n')
        expect(parseConfigAnchor(text)).toBe(540)
    })
})
