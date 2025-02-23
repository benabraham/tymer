import { formatTime } from '../../../format'

export const StatsBars = ({ periodSums }) => {
    const renderStatBar = (type, variant) => {
        const periodData = periodSums[type][variant]
        const isElapsed = variant === 'current'
        const showElapsed = isElapsed && periodData.duration !== periodData.durationElapsed

        return (
            <div class={`stats-bar stats-bar--${type} stats-bar--${variant}`}>
                <div class="stats-text">
                    {isElapsed
                        ? formatTime(periodData.duration)
                        : `${type} ${formatTime(periodData.duration)}`}
                </div>
                {showElapsed && (
                    <div
                        class={`
                            stats-elapsed
                            ${periodData.durationElapsed < 60000 ? 'stats-elapsed--none' : ''}
                        `}
                    >
                        <div class="stats-text stats-elapsed-text">
                            {formatTime(periodData.durationElapsed)}
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
            {renderStatBar('work', 'original')}
            {renderStatBar('work', 'current')}
        </div>
    )
}
