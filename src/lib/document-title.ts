// The browser tab title. One computed signal owns the whole string so every
// contributing piece of state is in one place; `formatDocumentTitle` is the
// reusable shape — a base plus any number of bracketed state flags.

import { computed, type ReadonlySignal } from '@preact/signals'
import { formatTime } from './format'
import type { PeriodData } from './period'
import { configPanelOpen } from './period-configs'
import { Schedule } from './schedule'
import { currentPeriod } from './timer'

export const BASE_TITLE = 'Tymer'

const ONE_HOUR = 60 * 60 * 1000
const ONE_MINUTE = 60 * 1000

// A flag is either a label or something falsy (the state isn't active).
type TitleFlag = string | false | null | undefined

// `Tymer [running] [editing durations]` — the base first, then one bracketed
// suffix per active flag, inactive ones dropped. Add new states by passing more
// flags, not by touching this function.
export const formatDocumentTitle = ({
    base,
    flags = [],
}: {
    base: string
    flags?: TitleFlag[]
}): string =>
    [base, ...flags.filter((flag): flag is string => Boolean(flag)).map(flag => `[${flag}]`)].join(
        ' ',
    )

// `W 5/25`, or `W 🛑 26/25` once past the planned duration. Minutes only while
// both values are under an hour, `h:mm` otherwise.
const formatPeriodProgress = (period: PeriodData): string => {
    const bothUnderOneHour = period.state.remaining < ONE_HOUR && period.state.duration < ONE_HOUR
    const format = (ms: number) =>
        bothUnderOneHour ? Math.ceil(ms / ONE_MINUTE).toString() : formatTime(ms)

    const typeInitial = period.config.type.charAt(0).toUpperCase()
    const overtimeIndicator = period.state.elapsed > period.config.userIntendedDuration ? '🛑 ' : ''
    const elapsed = format(period.state.elapsed)
    const intended = format(period.config.userIntendedDuration)

    return `${typeInitial} ${overtimeIndicator}${elapsed}/${intended}`
}

export const documentTitle: ReadonlySignal<string> = computed(() => {
    const isRunning = Schedule.isRunning.value
    const period = currentPeriod.value

    return formatDocumentTitle({
        base: isRunning && period ? formatPeriodProgress(period) : BASE_TITLE,
        flags: [isRunning && 'running', configPanelOpen.value && 'editing durations'],
    })
})
