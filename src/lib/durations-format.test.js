import { describe, it, expect } from 'vitest'
import {
    parseCurrentDurationsText,
    serializeCurrentDurations,
    formatDurationToken,
    formatElapsedToken,
    parseDurationsAnchor,
    formatAnchorToken,
} from './durations-format'

const MIN = 60000
const SEC = 1000

describe('parseCurrentDurationsText', () => {
    it('parses elapsed/total with notes, per the spec examples', () => {
        const text = ['W  20/20    Note here', 'B   6/20', 'F 2:23', 'B 0:12/20'].join('\n')
        expect(parseCurrentDurationsText(text)).toEqual([
            { type: 'work', elapsedMs: 20 * MIN, durationMs: 20 * MIN, note: 'Note here' },
            { type: 'break', elapsedMs: 6 * MIN, durationMs: 20 * MIN, note: '' },
            { type: 'fun', elapsedMs: 0, durationMs: (2 * 60 + 23) * MIN, note: '' },
            { type: 'break', elapsedMs: 12 * MIN, durationMs: 20 * MIN, note: '' },
        ])
    })

    it('treats no-colon as minutes, one colon as h:m, two colons as h:m:s', () => {
        expect(parseCurrentDurationsText('W 90')[0].durationMs).toBe(90 * MIN)
        expect(parseCurrentDurationsText('W 1:30')[0].durationMs).toBe(90 * MIN)
        expect(parseCurrentDurationsText('W 0:01:30/20')[0].elapsedMs).toBe(MIN + 30 * SEC)
    })

    it('omits elapsed (defaults 0) when there is no slash', () => {
        expect(parseCurrentDurationsText('F 5')[0]).toEqual({
            type: 'fun',
            elapsedMs: 0,
            durationMs: 5 * MIN,
            note: '',
        })
    })

    it('ignores empty and unparseable lines', () => {
        const text = ['', 'W 20/20', 'X 5', 'W a/b', 'B 1:2:3:4/5', 'F 3'].join('\n')
        expect(parseCurrentDurationsText(text).map(p => p.type)).toEqual(['work', 'fun'])
    })
})

describe('format tokens', () => {
    it('formats totals as minutes or h:mm', () => {
        expect(formatDurationToken(20 * MIN)).toBe('20')
        expect(formatDurationToken(90 * MIN)).toBe('1:30')
    })

    it('formats elapsed as h:mm:ss', () => {
        expect(formatElapsedToken(MIN + 30 * SEC)).toBe('0:01:30')
        expect(formatElapsedToken(0)).toBe('0:00:00')
    })
})

describe('parseDurationsAnchor', () => {
    it('parses a valid @h:mm anchor line to minutes-since-midnight', () => {
        expect(parseDurationsAnchor('@9:00')).toBe(540)
    })

    it('allows a leading space after @ and unpadded/padded minutes', () => {
        expect(parseDurationsAnchor('@ 9:00')).toBe(540)
        expect(parseDurationsAnchor('@09:5')).toBe(545)
        expect(parseDurationsAnchor('@0:00')).toBe(0)
        expect(parseDurationsAnchor('@23:59')).toBe(1439)
    })

    it('returns null for invalid anchor forms and absent anchors', () => {
        expect(parseDurationsAnchor('@')).toBeNull()
        expect(parseDurationsAnchor('@9')).toBeNull()
        expect(parseDurationsAnchor('@9:')).toBeNull()
        expect(parseDurationsAnchor('@24:00')).toBeNull()
        expect(parseDurationsAnchor('@9:60')).toBeNull()
        expect(parseDurationsAnchor('@9:00 extra')).toBeNull()
        expect(parseDurationsAnchor('x@9:00')).toBeNull()
        expect(parseDurationsAnchor('W 20\nB 6')).toBeNull()
    })

    it('uses the first valid anchor line when multiple are present', () => {
        expect(parseDurationsAnchor(['@9:00', '@10:00'].join('\n'))).toBe(540)
    })

    it('skips an invalid-shaped anchor line and uses the next valid one', () => {
        expect(parseDurationsAnchor(['@24:00', '@9:00'].join('\n'))).toBe(540)
    })

    it('parses out an anchor line mixed in among period lines', () => {
        const text = ['W 20', '@9:00', 'B 6'].join('\n')
        expect(parseDurationsAnchor(text)).toBe(540)
        expect(parseCurrentDurationsText(text).map(p => p.type)).toEqual(['work', 'break'])
    })
})

describe('formatAnchorToken', () => {
    it('formats minutes-since-midnight as @h:mm', () => {
        expect(formatAnchorToken(540)).toBe('@9:00')
        expect(formatAnchorToken(545)).toBe('@9:05')
        expect(formatAnchorToken(0)).toBe('@0:00')
        expect(formatAnchorToken(1439)).toBe('@23:59')
    })
})

describe('serializeCurrentDurations', () => {
    const period = ({ type, duration, elapsed, note = '' }) => ({
        config: { type, note, userIntendedDuration: duration },
        state: { duration, elapsed, remaining: Math.max(0, duration - elapsed) },
    })

    it('renders elapsed/total only when elapsed > 0', () => {
        const periods = [
            period({ type: 'work', duration: 20 * MIN, elapsed: MIN + 30 * SEC, note: 'hi' }),
            period({ type: 'fun', duration: 5 * MIN, elapsed: 0 }),
        ]
        expect(serializeCurrentDurations(periods)).toBe('W 0:01:30/20 hi\nF 5')
    })

    it('round-trips through the parser', () => {
        const periods = [period({ type: 'break', duration: 20 * MIN, elapsed: 12 * MIN })]
        const parsed = parseCurrentDurationsText(serializeCurrentDurations(periods))
        expect(parsed).toEqual([
            { type: 'break', elapsedMs: 12 * MIN, durationMs: 20 * MIN, note: '' },
        ])
    })

    it('prepends an anchor line when anchorMinutes is given', () => {
        const periods = [period({ type: 'fun', duration: 5 * MIN, elapsed: 0 })]
        expect(serializeCurrentDurations(periods, { anchorMinutes: 545 })).toBe('@9:05\nF 5')
    })

    it('prepends a midnight anchor line (0) rather than treating it as absent', () => {
        const periods = [period({ type: 'fun', duration: 5 * MIN, elapsed: 0 })]
        expect(serializeCurrentDurations(periods, { anchorMinutes: 0 })).toBe('@0:00\nF 5')
    })

    it('round-trips the anchor and periods together', () => {
        const periods = [period({ type: 'break', duration: 20 * MIN, elapsed: 12 * MIN })]
        const text = serializeCurrentDurations(periods, { anchorMinutes: 540 })
        expect(parseDurationsAnchor(text)).toBe(540)
        expect(parseCurrentDurationsText(text)).toEqual([
            { type: 'break', elapsedMs: 12 * MIN, durationMs: 20 * MIN, note: '' },
        ])
    })
})
