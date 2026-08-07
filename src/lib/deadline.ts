// Deadlines — absolute wall-clock targets, independent of the session's
// periods. Each is shown as a dashed marker over the timeline; once the clock
// passes one, its marker turns to the danger color and pulses, and a
// notification chime — randomly chosen once per deadline, then fixed — loops
// gaplessly until silenced in the UI. Only ONE alarm runs at a time: the
// LATEST expired deadline. When a newer deadline expires while an older one is
// still alarming, the older one is turned off for good and the newest takes
// over.
//
// Set/edited/cleared ONLY through the durations textareas, via '+' lines
// (see parseDeadlineLines in durations-format.ts):
//   +h:mm Label       → daily: recurs every day at that time (kind 'daily')
//   +<day> h:mm Label → absolute: one concrete timestamp (kind 'absolute')
//
// Persisted separately from the session (localStorage 'deadlines') — a daily
// deadline outlives sessions and config switches by design.

import { batch, computed, effect, type ReadonlySignal, type Signal, signal } from '@preact/signals'
import { differenceInCalendarDays, format } from 'date-fns'
import type { ParsedDeadline } from './durations-format'
import { hasDeadlineLine, parseDeadlineLines } from './durations-format'
import { pickRandomNotificationKey, playNotification } from './sounds'

export type Deadline =
    | { kind: 'absolute'; timestamp: number; label: string }
    | { kind: 'daily'; minutes: number; label: string }

export type DeadlineOccurrence = { deadline: Deadline; timestamp: number }

const STORAGE_KEY = 'deadlines'
const SILENCED_KEY = 'deadlineSilenced'
const ALARM_RETRY_MS = 2500

const isValidDeadline = (candidate: unknown): candidate is Deadline => {
    if (typeof candidate !== 'object' || candidate === null) return false
    const record = candidate as Record<string, unknown>
    if (typeof record.label !== 'string') return false
    if (record.kind === 'absolute') return Number.isFinite(record.timestamp)
    return (
        record.kind === 'daily'
        && Number.isFinite(record.minutes)
        && (record.minutes as number) >= 0
        && (record.minutes as number) < 24 * 60
    )
}

const loadDeadlines = (): Deadline[] => {
    try {
        const stored: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) as string)
        return Array.isArray(stored) ? stored.filter(isValidDeadline) : []
    } catch {
        return []
    }
}

const loadSilenced = (): number[] => {
    try {
        const stored: unknown = JSON.parse(localStorage.getItem(SILENCED_KEY) as string)
        return Array.isArray(stored) ? stored.filter((ts): ts is number => Number.isFinite(ts)) : []
    } catch {
        return []
    }
}

export const deadlines: Signal<Deadline[]> = signal(loadDeadlines())

// Occurrence timestamps whose alarm was turned off — by the silence button, by
// being superseded by a later expiry, or by being already overdue when typed.
// Keyed by timestamp so silencing is self-scoping: an absolute deadline stays
// silenced forever, a daily one resolves to a new timestamp after midnight and
// alarms again.
export const silencedDeadlines: Signal<number[]> = signal(loadSilenced())

effect(() => {
    try {
        if (deadlines.value.length === 0) localStorage.removeItem(STORAGE_KEY)
        else localStorage.setItem(STORAGE_KEY, JSON.stringify(deadlines.value))
    } catch {
        // Ignore storage failures — the in-memory value still applies.
    }
})

effect(() => {
    try {
        if (silencedDeadlines.value.length === 0) localStorage.removeItem(SILENCED_KEY)
        else localStorage.setItem(SILENCED_KEY, JSON.stringify(silencedDeadlines.value))
    } catch {
        // Ignore storage failures — the in-memory value still applies.
    }
})

// 1 Hz clock for everything deadline-related: marker positions, the daily
// resolution (which flips at midnight) and the overdue checks. The timer's own
// tick only runs while a session is running; a deadline must fire while idle
// too, so this module keeps its own clock. Writable so tests can pin "now".
export const deadlineNow: Signal<number> = signal(Date.now())

if (typeof window !== 'undefined') {
    setInterval(() => {
        deadlineNow.value = Date.now()
    }, 1000)
}

// The concrete occurrence a deadline points at relative to `now`: its
// timestamp when absolute, THAT day at h:mm when daily (before the time it is
// the day's upcoming occurrence; after it, the day's overdue one — until
// midnight rolls it over and the cycle restarts).
const occurrenceTimestamp = (deadline: Deadline, now: number): number => {
    if (deadline.kind === 'absolute') return deadline.timestamp
    const date = new Date(now)
    date.setHours(Math.floor(deadline.minutes / 60), deadline.minutes % 60, 0, 0)
    return date.getTime()
}

const occurrencesAt = (list: Deadline[], now: number): DeadlineOccurrence[] =>
    list.map(deadline => ({ deadline, timestamp: occurrenceTimestamp(deadline, now) }))

export const deadlineOccurrences: ReadonlySignal<DeadlineOccurrence[]> = computed(() =>
    occurrencesAt(deadlines.value, deadlineNow.value),
)

// The occurrence whose alarm currently belongs to: the LATEST expired one
// (max overdue timestamp), silenced or not. Null when nothing is overdue.
// Earlier overdue deadlines never alarm — the newest expiry always owns it.
export const deadlineAlarmTimestamp: ReadonlySignal<number | null> = computed(() => {
    const now = deadlineNow.value
    const overdue = deadlineOccurrences.value.filter(o => now >= o.timestamp)
    return overdue.length ? Math.max(...overdue.map(o => o.timestamp)) : null
})

export const deadlineAlarmActive: ReadonlySignal<boolean> = computed(() => {
    const ts = deadlineAlarmTimestamp.value
    return ts !== null && !silencedDeadlines.value.includes(ts)
})

// Adds occurrences to the silenced set, pruning entries that no longer match
// any current occurrence (yesterday's daily timestamps, deleted deadlines) so
// the persisted list stays small.
const addSilenced = (timestamps: number[]): void => {
    const current = new Set(deadlineOccurrences.peek().map(o => o.timestamp))
    const kept = silencedDeadlines.peek().filter(ts => current.has(ts))
    silencedDeadlines.value = [...new Set([...kept, ...timestamps])]
}

export const silenceDeadlineAlarm = (): void => {
    const ts = deadlineAlarmTimestamp.peek()
    if (ts !== null) addSilenced([ts])
}

// "Latest expired wins": when the alarm's owner changes while a previous owner
// existed, the previous one is turned off FOR GOOD — even if it was never
// explicitly silenced, and even if the newer deadline is later deleted (the
// older alarm must not suddenly resume hours later).
let lastAlarmTimestamp: number | null = deadlineAlarmTimestamp.peek()
effect(() => {
    const ts = deadlineAlarmTimestamp.value
    const previous = lastAlarmTimestamp
    lastAlarmTimestamp = ts
    if (previous !== null && ts !== previous) addSilenced([previous])
})

const deadlinesEqual = (a: Deadline, b: Deadline): boolean => {
    if (a.kind !== b.kind || a.label !== b.label) return false
    return a.kind === 'absolute'
        ? a.timestamp === (b as { timestamp: number }).timestamp
        : a.minutes === (b as { minutes: number }).minutes
}

const deadlineListsEqual = (a: Deadline[], b: Deadline[]): boolean =>
    a.length === b.length && a.every((deadline, i) => deadlinesEqual(deadline, b[i]))

// Replaces the deadline list. A deadline that is ALREADY overdue the moment it
// first appears starts silenced: the alarm is for the live crossing, not for
// typing "+yesterday 17:00" into the editor — which would otherwise blast
// chimes per keystroke. Occurrences that were already present keep their alarm
// state (adding a future deadline never quiets a currently ringing one).
// Batched so the alarm effects never observe the new list without the
// accompanying silencing.
export const setDeadlines = (next: Deadline[]): void => {
    if (deadlineListsEqual(next, deadlines.peek())) return
    const now = Date.now()
    const before = new Set(occurrencesAt(deadlines.peek(), now).map(o => o.timestamp))
    const newlyOverdue = occurrencesAt(next, now)
        .filter(o => o.timestamp <= now && !before.has(o.timestamp))
        .map(o => o.timestamp)
    batch(() => {
        deadlines.value = next
        if (newlyOverdue.length) addSilenced(newlyOverdue)
    })
}

// Resolve a parsed '+' line to a Deadline. Named days step from `reference`;
// an explicit day+month resolves in the reference's year — literal and
// predictable, and past dates are valid (that's the overdue state).
export const resolveParsedDeadline = (
    { minutes, day, label }: ParsedDeadline,
    reference: number,
): Deadline => {
    if (day === null) return { kind: 'daily', minutes, label }

    const date = new Date(reference)
    if (day === 'tomorrow') date.setDate(date.getDate() + 1)
    else if (day === 'yesterday') date.setDate(date.getDate() - 1)
    // setMonth(m, d) sets both fields atomically, avoiding intermediate
    // month-length overflow (same as the anchor's resolver).
    else if (day !== 'today') date.setMonth(day.monthIndex, day.day)
    date.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0)
    return { kind: 'absolute', timestamp: date.getTime(), label }
}

// Apply the '+' lines of an edited durations text.
// - ≥1 valid line → set exactly those (a single line mid-edit drops out until
//   it parses again; its silenced state is keyed by timestamp, so it comes
//   back exactly as it was)
// - '+' lines present but NONE valid → keep the current list (a half-edited
//   sole line means "leave it alone", same contract as the anchor)
// - no '+' line at all → clear, but only when the caller owns clearing
//   (clearOnAbsence). The live editor does; a config apply does not — a config
//   without '+' lines must not wipe deadlines set elsewhere.
export const applyDeadlinesFromText = (
    text: string,
    { reference = Date.now(), clearOnAbsence = false } = {},
): void => {
    const parsed = parseDeadlineLines(text)
    if (parsed.length) setDeadlines(parsed.map(line => resolveParsedDeadline(line, reference)))
    else if (clearOnAbsence && !hasDeadlineLine(text)) setDeadlines([])
}

// Day qualifier for a deadline timestamp relative to now — bidirectional,
// unlike formatDayMarker (which only looks back): '' today, 'tomorrow',
// 'yesterday', or a short date. Shown next to each marker's time, and reused
// (with 'today' spelled out) by the serializer below.
export const deadlineDayMarker = (timestamp: number, now: number): string => {
    const days = differenceInCalendarDays(timestamp, now)
    if (days === 0) return ''
    if (days === 1) return 'tomorrow'
    if (days === -1) return 'yesterday'
    return format(timestamp, 'd MMM')
}

// The '+' lines for serializeCurrentDurations — one per deadline, in list
// order; empty when none. An absolute deadline always carries its day
// qualifier ('today' included): a bare "+h:mm" would re-parse as daily,
// silently changing kind.
export const serializeDeadlineLines = (reference: number = Date.now()): string[] =>
    // .value, not .peek(): callers include the live editor's mirror effect,
    // which must re-serialize when the deadlines change.
    deadlines.value.map(deadline => {
        const label = deadline.label ? ` ${deadline.label}` : ''
        if (deadline.kind === 'daily') {
            const time = `${Math.floor(deadline.minutes / 60)}:${String(deadline.minutes % 60).padStart(2, '0')}`
            return `+${time}${label}`
        }
        const marker = deadlineDayMarker(deadline.timestamp, reference) || 'today'
        return `+${marker} ${format(deadline.timestamp, 'H:mm')}${label}`
    })

// Each deadline gets ONE chime, randomly picked on its first alarm round and
// reused for the rest of the browser session — deliberately in memory only,
// never persisted. Keyed by the deadline's identity (kind/time/label), so a
// daily deadline keeps its chime across days while the tab stays open, and a
// changed deadline gets a fresh pick.
const chimeByDeadline = new Map<string, string>()

const alarmChimeKey = (): string | null => {
    const ts = deadlineAlarmTimestamp.peek()
    if (ts === null) return null
    const owner = deadlineOccurrences.peek().find(o => o.timestamp === ts)
    if (!owner) return null
    const key = JSON.stringify(owner.deadline)
    const existing = chimeByDeadline.get(key)
    if (existing) return existing
    const picked = pickRandomNotificationKey()
    chimeByDeadline.set(key, picked)
    return picked
}

// Alarm loop: while active, replay the owning deadline's chime back-to-back —
// each round starts as soon as the previous clip ends, no deliberate gap; the
// chime is re-resolved per round, so a takeover by a later expiry switches
// sounds at the next clip boundary. Only a FAILED play waits before retrying
// (muted/locked audio would otherwise busy-spin). A module-level flag
// (bookkeeping, never rendered) keeps the effect from stacking loops; the loop
// re-checks the signal each round so silencing (or clearing/muting) stops it
// at the next boundary.
let alarmLoopRunning = false

const runAlarmLoop = async (): Promise<void> => {
    if (alarmLoopRunning) return
    alarmLoopRunning = true
    while (deadlineAlarmActive.peek()) {
        const chime = alarmChimeKey()
        if (chime === null) break
        const played = await playNotification(chime)
        if (!played) await new Promise(resolve => setTimeout(resolve, ALARM_RETRY_MS))
    }
    alarmLoopRunning = false
}

if (typeof window !== 'undefined') {
    effect(() => {
        if (deadlineAlarmActive.value) void runAlarmLoop()
    })
}
