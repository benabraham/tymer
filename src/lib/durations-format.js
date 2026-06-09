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

const TYPE_TO_CHAR = { work: 'W', break: 'B', fun: 'F' }
const CHAR_TO_TYPE = { W: 'work', B: 'break', F: 'fun' }

const pad = n => String(n).padStart(2, '0')

// Parse one time token → ms. No colon = minutes; h:m; or h:m:s.
const parseTimeToken = token => {
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
const parseDurationField = field => {
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

const parseLine = line => {
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

export const parseCurrentDurationsText = text => text.split('\n').map(parseLine).filter(Boolean)

// total/duration token: whole minutes, or h:mm when >= 1 hour
export const formatDurationToken = ms => {
    const totalMinutes = Math.round(ms / 60000)
    if (totalMinutes < 60) return String(totalMinutes)
    return `${Math.floor(totalMinutes / 60)}:${pad(totalMinutes % 60)}`
}

// elapsed token: h:mm:ss (elapsed tracks seconds)
export const formatElapsedToken = ms => {
    const totalSeconds = Math.floor(ms / 1000)
    const h = Math.floor(totalSeconds / 3600)
    const m = Math.floor((totalSeconds % 3600) / 60)
    const s = totalSeconds % 60
    return `${h}:${pad(m)}:${pad(s)}`
}

// Live periods → editable text. Elapsed is shown only when > 0.
export const serializeCurrentDurations = periods =>
    periods
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
