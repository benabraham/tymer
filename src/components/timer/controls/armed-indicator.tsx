import { useSignal } from '@preact/signals'
import { format } from 'date-fns'
import { useEffect } from 'preact/hooks'
import { formatDayMarker } from '../../../lib/format.js'
import { Schedule } from '../../../lib/schedule.js'

const pad = (n: number) => String(n).padStart(2, '0')

// mm:ss countdown, floor(0) at most
const formatCountdown = (ms: number) => {
    const totalSeconds = Math.max(0, Math.ceil(ms / 1000))
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    return `${minutes}:${pad(seconds)}`
}

// Shown while idle + anchored ("armed"). A future anchor counts down live
// (per-second, via setInterval — follows the timeline-current-time pattern);
// a past anchor shows a static "start from" label.
export const ArmedIndicator = () => {
    const now = useSignal(Date.now())

    useEffect(() => {
        const interval = setInterval(() => {
            now.value = Date.now()
        }, 1000)
        return () => clearInterval(interval)
    }, [])

    const anchor = Schedule.timestampAnchor.value
    if (anchor == null) return null

    const label = format(new Date(anchor), 'HH:mm')
    const isFuture = anchor > now.value
    // Past anchors can lie before today (midnight crossing, reloaded sessions)
    const dayMarker = formatDayMarker(anchor, now.value)

    return (
        <span class="armed-indicator">
            {isFuture
                ? `Starts at ${label} · in ${formatCountdown(anchor - now.value)}`
                : `Start from ${dayMarker ? `${dayMarker} ` : ''}${label}`}
        </span>
    )
}
