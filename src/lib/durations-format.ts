// Text format for the "Edit current durations" editor — an alternative to the
// UI/keyboard period controls that operates on the LIVE timer (not a saved
// config). One line per period:
//
//   <Type> <elapsed>/<total> <Note>
//
//   Type:    W | B | F (case-insensitive)
//   total:   the period's full duration
//   elapsed: time already spent in the period (optional — omitted when 0, so a
//            line may be just `<Type> <total> <Note>`)
//   Note:    free text (optional)
//
// Each time value is integer minutes when it has no ':', otherwise h:m / h:mm
// (one colon) or h:mm:ss (two colons). Elapsed carries seconds, so it is
// rendered as h:mm:ss; totals are rendered as whole minutes or h:mm.

import type { PeriodData, PeriodType } from './period.js'

// A single parsed line from the current-durations editor text — the result of
// `parseCurrentDurationsText`.
export type ParsedCurrentDurationsLine = {
    type: PeriodType
    elapsedMs: number
    durationMs: number
    note: string
}

// The day qualifier resolved from an "@..." anchor header line — see
// `parseDurationsAnchor`. `null` means a plain "@h:mm" (today); resolving
// day+minutes to a timestamp is the caller's job.
export type DurationsAnchorDay = 'yesterday' | { day: number; monthIndex: number } | null

export type ParsedDurationsAnchor = {
    minutes: number
    day: DurationsAnchorDay
}

const TYPE_TO_CHAR: Record<PeriodType, string> = { work: 'W', break: 'B', fun: 'F' }
const CHAR_TO_TYPE: Record<string, PeriodType | undefined> = { W: 'work', B: 'break', F: 'fun' }

const pad = (n: number): string => String(n).padStart(2, '0')

// Parse one time token → ms. No colon = minutes; h:m; or h:m:s.
const parseTimeToken = (token: string): number | null => {
    if (!token) return null
    if (token.includes(':')) {
        const parts = token.split(':')
        if (parts.length < 2 || parts.length > 3) return null
        if (!parts.every(p => /^\d+$/.test(p))) return null
        const [h, m, s = 0] = parts.map(p => parseInt(p, 10))
        return ((h * 60 + m) * 60 + s) * 1000
    }
    if (!/^\d+$/.test(token)) return null
    return parseInt(token, 10) * 60000
}

// "elapsed/total" or just "total" → { elapsedMs, durationMs } | null
const parseDurationField = (field: string): { elapsedMs: number; durationMs: number } | null => {
    if (field.includes('/')) {
        const parts = field.split('/')
        if (parts.length !== 2) return null
        const elapsedMs = parseTimeToken(parts[0])
        const durationMs = parseTimeToken(parts[1])
        if (elapsedMs === null || durationMs === null) return null
        return { elapsedMs, durationMs }
    }
    const durationMs = parseTimeToken(field)
    if (durationMs === null) return null
    return { elapsedMs: 0, durationMs }
}

const parseLine = (line: string): ParsedCurrentDurationsLine | null => {
    const match = line.trim().match(/^(\S+)\s+(\S+)(?:\s+(.*))?$/)
    if (!match) return null
    const type = CHAR_TO_TYPE[match[1].toUpperCase()]
    if (!type) return null
    const field = parseDurationField(match[2])
    if (!field) return null
    return {
        type,
        elapsedMs: field.elapsedMs,
        durationMs: field.durationMs,
        note: (match[3] || '').trim(),
    }
}

export const parseCurrentDurationsText = (text: string): ParsedCurrentDurationsLine[] =>
    text
        .split('\n')
        .map(parseLine)
        .filter((line): line is ParsedCurrentDurationsLine => line !== null)

// Anchor header line — pins session start to a wall-clock time. Only the first
// valid anchor line in the text counts. Forms (day qualifier optional):
//
//   @h:mm              today (must already have passed — crossing midnight
//                      requires an explicit qualifier, so a typo'd time can
//                      never silently inject hours from yesterday)
//   @yesterday h:mm    explicitly yesterday
//   @30 Dec h:mm       explicit day+month (most recent occurrence)
//
// The day qualifier makes serialized anchors from before today deterministic:
// re-parsing the mirrored text always resolves to the same day.
const ANCHOR_RE = /^@\s*(?:(yesterday)\s+|(\d{1,2})\s+([a-z]{3})\s+)?(\d{1,2}):(\d{1,2})$/i

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

// → { minutes, day } | null, where day is null (plain time), 'yesterday', or
// { day, monthIndex }. Resolving day+minutes to a timestamp is the caller's
// job (it needs a reference "now").
export const parseDurationsAnchor = (text: string): ParsedDurationsAnchor | null => {
    for (const line of text.split('\n')) {
        const match = line.trim().match(ANCHOR_RE)
        if (!match) continue
        const hours = parseInt(match[4], 10)
        const minutes = parseInt(match[5], 10)
        if (hours > 23 || minutes > 59) continue

        if (match[1]) return { minutes: hours * 60 + minutes, day: 'yesterday' }
        if (match[2]) {
            const day = parseInt(match[2], 10)
            const monthIndex = MONTHS.indexOf(match[3].toLowerCase())
            if (monthIndex === -1 || day < 1 || day > 31) continue
            return { minutes: hours * 60 + minutes, day: { day, monthIndex } }
        }
        return { minutes: hours * 60 + minutes, day: null }
    }
    return null
}

// True when any line declares anchor INTENT (starts with '@'), whether or not
// it parses. A half-edited anchor line must read as "leave the anchor alone",
// not as "no anchor" — only a fully absent line means unpin.
export const hasAnchorLine = (text: string): boolean =>
    text.split('\n').some(line => line.trim().startsWith('@'))

// Deadline lines — wall-clock targets shown as markers over the timeline
// (see src/lib/deadline.ts). EVERY valid deadline line counts — a text may
// declare several deadlines. Forms (label optional, free text):
//
//   +h:mm Label            no date → recurs EVERY day at that time
//   +today h:mm Label      absolute, today
//   +tomorrow h:mm Label   absolute, tomorrow
//   +yesterday h:mm Label  absolute, yesterday (already overdue)
//   +30 Dec h:mm Label     absolute, that date in the current year
//
// An absolute deadline always serializes WITH its day qualifier (today
// included) — a bare "+h:mm" re-parsing as daily would silently change kind.
type DeadlineDay = 'today' | 'tomorrow' | 'yesterday' | { day: number; monthIndex: number } | null

export type ParsedDeadline = {
    minutes: number
    day: DeadlineDay
    label: string
}

const DEADLINE_RE =
    /^\+\s*(?:(today|tomorrow|yesterday)\s+|(\d{1,2})\s+([a-z]{3})\s+)?(\d{1,2}):(\d{1,2})(?:\s+(.*))?$/i

const parseDeadlineMatch = (match: RegExpMatchArray): ParsedDeadline | null => {
    const hours = parseInt(match[4], 10)
    const minutes = parseInt(match[5], 10)
    if (hours > 23 || minutes > 59) return null

    const label = (match[6] || '').trim()
    if (match[1]) {
        return {
            minutes: hours * 60 + minutes,
            day: match[1].toLowerCase() as DeadlineDay,
            label,
        }
    }
    if (match[2]) {
        const day = parseInt(match[2], 10)
        const monthIndex = MONTHS.indexOf(match[3].toLowerCase())
        if (monthIndex === -1 || day < 1 || day > 31) return null
        return { minutes: hours * 60 + minutes, day: { day, monthIndex }, label }
    }
    return { minutes: hours * 60 + minutes, day: null, label }
}

// → every valid deadline line, in text order (there may be several deadlines).
// day is null (daily), a named day, or { day, monthIndex }. Resolving
// day+minutes to a timestamp is the caller's job (it needs a reference "now").
export const parseDeadlineLines = (text: string): ParsedDeadline[] =>
    text
        .split('\n')
        .map(line => {
            const match = line.trim().match(DEADLINE_RE)
            return match ? parseDeadlineMatch(match) : null
        })
        .filter((line): line is ParsedDeadline => line !== null)

// Same contract as hasAnchorLine: a half-edited '+' line means "leave the
// deadline alone" — only a fully absent line means clear.
export const hasDeadlineLine = (text: string): boolean =>
    text.split('\n').some(line => line.trim().startsWith('+'))

export const formatAnchorToken = (minutes: number, dayMarker = ''): string =>
    `@${dayMarker ? `${dayMarker} ` : ''}${Math.floor(minutes / 60)}:${pad(minutes % 60)}`

// total/duration token: whole minutes, or h:mm when >= 1 hour
export const formatDurationToken = (ms: number): string => {
    const totalMinutes = Math.round(ms / 60000)
    if (totalMinutes < 60) return String(totalMinutes)
    return `${Math.floor(totalMinutes / 60)}:${pad(totalMinutes % 60)}`
}

// elapsed token: h:mm:ss (elapsed tracks seconds)
export const formatElapsedToken = (ms: number): string => {
    const totalSeconds = Math.floor(ms / 1000)
    const h = Math.floor(totalSeconds / 3600)
    const m = Math.floor((totalSeconds % 3600) / 60)
    const s = totalSeconds % 60
    return `${h}:${pad(m)}:${pad(s)}`
}

// Live periods → editable text. Elapsed is shown only when > 0. When
// anchorMinutes is given (not null), an "@h:mm" header line is prepended —
// with the day qualifier (e.g. "yesterday", "30 Dec") when anchorDayMarker is
// non-empty, so anchors from before today survive the round-trip exactly.
// When deadlineLines is non-empty, they are appended as the last lines —
// the caller formats them (see serializeDeadlineLines in deadline.ts).
export const serializeCurrentDurations = (
    periods: PeriodData[],
    {
        anchorMinutes = null,
        anchorDayMarker = '',
        deadlineLines = [],
    }: {
        anchorMinutes?: number | null
        anchorDayMarker?: string
        deadlineLines?: string[]
    } = {},
): string => {
    const lines = periods
        .map(period => {
            const char = TYPE_TO_CHAR[period.config.type]
            const total = formatDurationToken(period.state.duration)
            const field =
                period.state.elapsed > 0
                    ? `${formatElapsedToken(period.state.elapsed)}/${total}`
                    : total
            const note = period.config.note ? ` ${period.config.note}` : ''
            return `${char} ${field}${note}`
        })
        .join('\n')
    const withAnchor =
        anchorMinutes != null
            ? `${formatAnchorToken(anchorMinutes, anchorDayMarker)}\n${lines}`
            : lines
    return deadlineLines.length ? [withAnchor, ...deadlineLines].join('\n') : withAnchor
}
