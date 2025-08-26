import { describe, it, expect } from 'vitest'
import { formatTime } from './format'

describe('formatTime rounding', () => {
    describe('elapsed and remaining time should add up to total duration', () => {
        it('handles 12 minute period with 2:15 elapsed', () => {
            const totalMs = 12 * 60 * 1000 // 12 minutes
            const elapsedMs = 2 * 60 * 1000 + 15 * 1000 // 2 minutes 15 seconds
            const remainingMs = totalMs - elapsedMs // 9 minutes 45 seconds

            const totalFormatted = formatTime(totalMs, false, false)
            const elapsedFormatted = formatTime(elapsedMs, true, false) // elapsed=true, floors to 2 min
            const remainingFormatted = formatTime(remainingMs, false, true) // remaining=true, ceils to 10 min

            // Parse formatted times back to minutes
            const parseTime = timeStr => {
                const [hours, minutes] = timeStr.split(':').map(Number)
                return hours * 60 + minutes
            }

            const totalMinutes = parseTime(totalFormatted)
            const elapsedMinutes = parseTime(elapsedFormatted)
            const remainingMinutes = parseTime(remainingFormatted)

            expect(elapsedMinutes + remainingMinutes).toBe(totalMinutes)
            expect(elapsedFormatted).toBe('0:02')
            expect(remainingFormatted).toBe('0:10')
            expect(totalFormatted).toBe('0:12')
        })

        it('handles 48 minute period near completion', () => {
            const totalMs = 48 * 60 * 1000 // 48 minutes
            const elapsedMs = 47 * 60 * 1000 + 50 * 1000 // 47 minutes 50 seconds
            const remainingMs = totalMs - elapsedMs // 10 seconds

            const totalFormatted = formatTime(totalMs, false, false)
            const elapsedFormatted = formatTime(elapsedMs, true, false) // elapsed=true, floors to 47 min
            const remainingFormatted = formatTime(remainingMs, false, true) // remaining=true, ceils to 1 min

            const parseTime = timeStr => {
                const [hours, minutes] = timeStr.split(':').map(Number)
                return hours * 60 + minutes
            }

            const totalMinutes = parseTime(totalFormatted)
            const elapsedMinutes = parseTime(elapsedFormatted)
            const remainingMinutes = parseTime(remainingFormatted)

            expect(elapsedMinutes + remainingMinutes).toBe(totalMinutes)
            expect(elapsedFormatted).toBe('0:47')
            expect(remainingFormatted).toBe('0:01')
            expect(totalFormatted).toBe('0:48')
        })

        it('handles 60 minute period at halfway point', () => {
            const totalMs = 60 * 60 * 1000 // 60 minutes
            const elapsedMs = 29 * 60 * 1000 + 30 * 1000 // 29 minutes 30 seconds
            const remainingMs = totalMs - elapsedMs // 30 minutes 30 seconds

            const totalFormatted = formatTime(totalMs, false, false)
            const elapsedFormatted = formatTime(elapsedMs, true, false) // elapsed=true, floors to 29 min
            const remainingFormatted = formatTime(remainingMs, false, true) // remaining=true, ceils to 31 min

            const parseTime = timeStr => {
                const [hours, minutes] = timeStr.split(':').map(Number)
                return hours * 60 + minutes
            }

            const totalMinutes = parseTime(totalFormatted)
            const elapsedMinutes = parseTime(elapsedFormatted)
            const remainingMinutes = parseTime(remainingFormatted)

            expect(elapsedMinutes + remainingMinutes).toBe(totalMinutes)
            expect(elapsedFormatted).toBe('0:29')
            expect(remainingFormatted).toBe('0:31')
            expect(totalFormatted).toBe('1:00')
        })

        it('handles edge case with 1 second remaining', () => {
            const totalMs = 10 * 60 * 1000 // 10 minutes
            const elapsedMs = 9 * 60 * 1000 + 59 * 1000 // 9 minutes 59 seconds
            const remainingMs = totalMs - elapsedMs // 1 second

            const totalFormatted = formatTime(totalMs, false, false)
            const elapsedFormatted = formatTime(elapsedMs, true, false) // elapsed=true, floors to 9 min
            const remainingFormatted = formatTime(remainingMs, false, true) // remaining=true, ceils to 1 min

            const parseTime = timeStr => {
                const [hours, minutes] = timeStr.split(':').map(Number)
                return hours * 60 + minutes
            }

            const totalMinutes = parseTime(totalFormatted)
            const elapsedMinutes = parseTime(elapsedFormatted)
            const remainingMinutes = parseTime(remainingFormatted)

            expect(elapsedMinutes + remainingMinutes).toBe(totalMinutes)
            expect(elapsedFormatted).toBe('0:09')
            expect(remainingFormatted).toBe('0:01')
            expect(totalFormatted).toBe('0:10')
        })

        it('handles exactly completed period', () => {
            const totalMs = 25 * 60 * 1000 // 25 minutes
            const elapsedMs = 25 * 60 * 1000 // 25 minutes exactly
            const remainingMs = 0 // 0 seconds

            const totalFormatted = formatTime(totalMs, false, false)
            const elapsedFormatted = formatTime(elapsedMs, true, false) // elapsed=true
            const remainingFormatted = formatTime(remainingMs, false, true) // remaining=true

            const parseTime = timeStr => {
                const [hours, minutes] = timeStr.split(':').map(Number)
                return hours * 60 + minutes
            }

            const totalMinutes = parseTime(totalFormatted)
            const elapsedMinutes = parseTime(elapsedFormatted)
            const remainingMinutes = parseTime(remainingFormatted)

            expect(elapsedMinutes + remainingMinutes).toBe(totalMinutes)
            expect(elapsedFormatted).toBe('0:25')
            expect(remainingFormatted).toBe('0:00')
            expect(totalFormatted).toBe('0:25')
        })
    })

    describe('formatTime parameter behavior', () => {
        it('uses default behavior (ceil) when no elapsed/remaining specified', () => {
            const ms = 5 * 60 * 1000 + 30 * 1000 // 5 minutes 30 seconds
            const formatted = formatTime(ms)
            expect(formatted).toBe('0:06') // ceils to 6 minutes
        })

        it('floors when elapsed=true', () => {
            const ms = 5 * 60 * 1000 + 30 * 1000 // 5 minutes 30 seconds
            const formatted = formatTime(ms, true, false)
            expect(formatted).toBe('0:05') // floors to 5 minutes
        })

        it('ceils when remaining=true', () => {
            const ms = 5 * 60 * 1000 + 30 * 1000 // 5 minutes 30 seconds
            const formatted = formatTime(ms, false, true)
            expect(formatted).toBe('0:06') // ceils to 6 minutes
        })

        it('handles null/undefined input', () => {
            expect(formatTime(null)).toBe('–––')
            expect(formatTime(undefined)).toBe('–––')
        })

        it('formats hours correctly', () => {
            const ms = 125 * 60 * 1000 // 125 minutes
            const formatted = formatTime(ms, false, false)
            expect(formatted).toBe('2:05') // 2 hours 5 minutes
        })
    })

    describe('debug mode', () => {
        it('shows seconds in debug mode', () => {
            const ms = 125 * 60 * 1000 + 45 * 1000 // 125 minutes 45 seconds
            const formatted = formatTime(ms, false, false, true)
            expect(formatted).toContain(':05:45') // includes seconds
            expect(formatted).toContain('7545000') // includes milliseconds
        })
    })
})
