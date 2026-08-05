import { formatTime } from '../../../lib/format.js'
import type { PeriodType } from '../../../lib/period.js'
import type { PeriodSums } from './stats.js'

type StatsBarsProps = {
    periodSums: PeriodSums
    workProjectedMs: number | null
}

type Variant = 'original' | 'current'

export const StatsBars = ({ periodSums, workProjectedMs }: StatsBarsProps) => {
    const renderStatBar = (type: PeriodType, variant: Variant) => {
        const periodData = periodSums[type][variant]
        const isElapsed = variant === 'current'
        const showElapsed = isElapsed && periodData.duration !== periodData.durationElapsed
        const showProjected = type === 'work' && variant === 'current' && workProjectedMs != null
        const showRemaining =
            isElapsed
            && periodData.durationRemaining > 0
            && periodData.durationRemaining !== periodData.duration

        return (
            <div class={`stats-bar stats-bar--${type} stats-bar--${variant}`}>
                <div class="stats-text">
                    {isElapsed
                        ? formatTime(periodData.duration)
                        : `${type} ${formatTime(periodData.duration)}`}
                    {showRemaining && (
                        <span class="stats-remaining-text">
                            {` (${formatTime(periodData.durationRemaining, { mode: 'remaining' })} remains)`}
                        </span>
                    )}
                </div>
                {showElapsed && (
                    <div
                        class={`
                            stats-elapsed
                            ${periodData.durationElapsed < 60000 ? 'stats-elapsed--none' : ''}
                        `}
                    >
                        <div class="stats-text stats-elapsed-text">
                            {formatTime(periodData.durationElapsed, { mode: 'elapsed' })}
                        </div>
                    </div>
                )}
                {showProjected && (
                    <div class="stats-projected">
                        <div class="stats-text stats-projected-text">
                            {formatTime(workProjectedMs)}
                        </div>
                    </div>
                )}
            </div>
        )
    }

    return (
        <div class="stats-bars">
            {renderStatBar('break', 'original')}
            {renderStatBar('break', 'current')}
            {renderStatBar('fun', 'original')}
            {renderStatBar('fun', 'current')}
            {renderStatBar('work', 'original')}
            {renderStatBar('work', 'current')}
        </div>
    )
}
