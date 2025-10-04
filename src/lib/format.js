// converts milliseconds to human-readable format
export const formatTime = (ms, { mode, debug, compact } = {}) => {
    // handle null/undefined input
    if (ms == null) return '––:––'

    if (debug) {
        // debug mode shows exact seconds
        const totalSeconds = Math.floor(ms / 1000)
        const hours = Math.floor(totalSeconds / 3600)
        const minutes = Math.floor((totalSeconds % 3600) / 60)
        const seconds = totalSeconds % 60
        const pad = (num, places = 2, fillChar = '0') => num.toString().padStart(places, fillChar)
        return `${pad(hours)}:${pad(minutes)}:${pad(seconds)} ${pad(ms, 6, ' ')} ms`
    }

    // For non-debug mode, round at the minute level for proper display
    // elapsed time should round down, remaining time should round up
    let totalMinutes
    if (mode === 'elapsed') {
        // Floor for elapsed time
        totalMinutes = Math.floor(ms / (60 * 1000))
    } else if (mode === 'remaining') {
        // Ceil for remaining time
        totalMinutes = Math.ceil(ms / (60 * 1000))
    } else {
        // Default behavior: round to nearest minute
        totalMinutes = Math.round(ms / (60 * 1000))
    }

    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60

    const pad = (num, places = 2, fillChar = '0') => num.toString().padStart(places, fillChar)

    // Compact mode: show just minutes if under 1 hour
    if (compact && hours === 0) {
        return `${minutes}`
    }

    return `${hours}:${pad(minutes)}`
}

// converts milliseconds to minutes (rounding down by milliseconds)
export const msToMinutes = ms => Math.floor(ms / 60000)
