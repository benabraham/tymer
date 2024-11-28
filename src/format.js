// converts milliseconds to human-readable format
export const formatTime = (ms, floor, debug) => {
    // handle null/undefined input
    if (ms == null) return '–––'

    const totalSeconds = floor ? Math.floor(ms / 1000) : Math.ceil(ms / 1000)
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = totalSeconds % 60

    const pad = (num, places = 2, fillChar = '0') => num.toString().padStart(places, fillChar)
    if (debug) return `${pad(hours)}:${pad(minutes)}:${pad(seconds)} ${pad(ms, 6, ' ')} ms`
    return `${hours}:${pad(minutes)}`
}

// converts milliseconds to minutes (rounding down by milliseconds)
export const msToMinutes = (ms) => Math.floor(ms / 60000)
