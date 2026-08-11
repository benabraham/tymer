import type { SoundVariant } from '../lib/sound-manifest'

export type PreviewCell = { set: string; takes: SoundVariant[] }
export type PreviewRow = { key: string; label: string; cells: PreviewCell[] }
export type PreviewBank = { id: string; label: string; rows: PreviewRow[] }
export type SharedRow = { key: string; label: string; takes: SoundVariant[] }
export type PreviewModel = {
    sets: string[]
    banks: PreviewBank[]
    shared: SharedRow[]
    totals: { events: number; sets: number; takes: number }
}

const isShared = (takes: SoundVariant[]) => takes.every(take => take.set === null)

const notificationNumber = (key: string) => {
    const match = key.match(/^notification_(\d+)$/)
    return match ? Number(match[1]) : null
}

// the collapsed group first, then button, then timerFinished — mirrors how
// the notification bank dwarfs the two one-off keys.
const sharedSortRank = (key: string): number => {
    if (key === 'notification') return 0
    if (key === 'button') return 1
    if (key === 'timerFinished') return 2
    return 3
}

const compareShared = (a: SharedRow, b: SharedRow) => sharedSortRank(a.key) - sharedSortRank(b.key)

const sharedLabel = (key: string) => {
    if (key === 'button') return 'Button'
    if (key === 'timerFinished') return 'Timer finished'
    if (key === 'notification') return 'Notification'
    return key
}

const TIMESUP_ORDER = ['work', 'break', 'fun', 'finish']

// Checked in this order — NOT emission order — so the longer, more specific
// prefix (elapsed_break_) wins before the shorter one (elapsed_) can match.
const BANK_MATCHERS: { id: string; label: string; prefix: string }[] = [
    { id: 'elapsed_break', label: 'Elapsed (break)', prefix: 'elapsed_break_' },
    { id: 'elapsed', label: 'Elapsed (work)', prefix: 'elapsed_' },
    { id: 'remaining_break', label: 'Remaining (break)', prefix: 'remaining_break_' },
    { id: 'remaining', label: 'Remaining (work)', prefix: 'remaining_' },
    { id: 'overtime_break', label: 'Overtime (break)', prefix: 'overtime_break_' },
    { id: 'overtime', label: 'Overtime (work)', prefix: 'overtime_' },
    { id: 'deadline', label: 'Deadline warning', prefix: 'deadline_' },
    { id: 'timesup', label: "Time's up", prefix: 'timesup_' },
]

// Emission order is the contract's fixed table order, independent of the
// (longest-prefix-first) order matching happens in above.
const BANK_ORDER = [
    'elapsed',
    'remaining',
    'elapsed_break',
    'remaining_break',
    'overtime',
    'overtime_break',
    'deadline',
    'timesup',
    'other',
]

const bankFor = (key: string) => {
    const matcher = BANK_MATCHERS.find(candidate => key.startsWith(candidate.prefix))
    if (matcher) return matcher
    return { id: 'other', label: 'Other', prefix: '' }
}

const trailingMinutes = (key: string) => {
    const match = key.match(/_(\d+)$/)
    return match ? Number(match[1]) : null
}

const rowLabel = (key: string) => {
    const minutes = trailingMinutes(key)
    if (minutes !== null) return `${minutes} min`
    const timesupMatch = key.match(/^timesup_(work|break|fun|finish)$/)
    if (timesupMatch) return timesupMatch[1][0].toUpperCase() + timesupMatch[1].slice(1)
    return key
}

// Numeric on the trailing minute (elapsed_12 before elapsed_108, which a
// lexical sort would get backwards); timesup has no number, so it falls back
// to the fixed work/break/fun/finish order.
const rowSortKey = (key: string) => {
    const minutes = trailingMinutes(key)
    if (minutes !== null) return minutes
    const timesupMatch = key.match(/^timesup_(work|break|fun|finish)$/)
    if (timesupMatch) return TIMESUP_ORDER.indexOf(timesupMatch[1])
    return 0
}

const buildCells = (takes: SoundVariant[], sets: string[]): PreviewCell[] =>
    sets.map(set => ({ set, takes: takes.filter(take => take.set === set) }))

export const buildPreviewModel = (input: {
    variants: Record<string, SoundVariant[]>
    sets: string[]
}): PreviewModel => {
    const shared: SharedRow[] = []
    const rowsByBankId = new Map<string, PreviewRow[]>()
    const labelByBankId = new Map<string, string>()
    // notification_<n> keys collapse into one row, but each still counts
    // toward totals.events individually — collect them by their own numeric
    // key order first, concatenate once every key has been seen.
    const notificationTakesByNumber = new Map<number, SoundVariant[]>()
    let takeCount = 0
    let eventCount = 0

    for (const [key, takes] of Object.entries(input.variants)) {
        if (takes.length === 0) continue
        takeCount += takes.length
        eventCount += 1

        const notifNumber = notificationNumber(key)
        if (notifNumber !== null) {
            notificationTakesByNumber.set(notifNumber, takes)
            continue
        }

        if (isShared(takes)) {
            shared.push({ key, label: sharedLabel(key), takes })
            continue
        }

        const { id, label } = bankFor(key)
        labelByBankId.set(id, label)
        const rows = rowsByBankId.get(id) ?? []
        rows.push({ key, label: rowLabel(key), cells: buildCells(takes, input.sets) })
        rowsByBankId.set(id, rows)
    }

    if (notificationTakesByNumber.size > 0) {
        const notificationTakes = [...notificationTakesByNumber.entries()]
            .sort(([a], [b]) => a - b)
            .flatMap(([, takes]) => takes)
        shared.push({
            key: 'notification',
            label: sharedLabel('notification'),
            takes: notificationTakes,
        })
    }

    shared.sort(compareShared)

    const banks: PreviewBank[] = BANK_ORDER.filter(id => rowsByBankId.has(id)).map(id => {
        const rows = rowsByBankId.get(id) ?? []
        rows.sort((a, b) => rowSortKey(a.key) - rowSortKey(b.key))
        return { id, label: labelByBankId.get(id) ?? id, rows }
    })

    return {
        sets: input.sets,
        banks,
        shared,
        totals: {
            events: eventCount,
            sets: input.sets.length,
            takes: takeCount,
        },
    }
}
