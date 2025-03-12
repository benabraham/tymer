import { initialState, timerState } from '../../../lib/timer'
import { msToMinutes } from '../../../lib/format'
import { StatsBars } from './stats-bars'

export const Stats = () => {
    const calculateTypeSums = ({ periods, type }) => {
        const sumByKey = key =>
            periods.reduce((sum, period) => (period.type === type ? sum + period[key] : sum), 0)

        return {
            duration: sumByKey('periodDuration'),
            durationElapsed: sumByKey('periodDurationElapsed'),
            durationRemaining: sumByKey('periodDurationRemaining'),
        }
    }

    const calculatePeriodSums = ({ initialPeriods, currentPeriods }) => {
        const calculateFor = periods => type => calculateTypeSums({ periods, type })

        const types = timerState.value.types
        return types.reduce(
            (acc, type) => ({
                ...acc,
                [type]: {
                    original: calculateFor(initialPeriods)(type),
                    current: calculateFor(currentPeriods)(type),
                },
            }),
            {},
        )
    }

    const periodSums = calculatePeriodSums({
        initialPeriods: initialState.periods,
        currentPeriods: timerState.value.periods,
    })

    return (
        <div
            class="stats"
            style={`
                --break-original: ${msToMinutes(periodSums.break.original.duration)};
                --break-planned: ${msToMinutes(periodSums.break.current.duration)};
                --break-elapsed: ${msToMinutes(periodSums.break.current.durationElapsed)};
            
                --fun-original: ${msToMinutes(periodSums.fun.original.duration)};
                --fun-planned: ${msToMinutes(periodSums.fun.current.duration)};
                --fun-elapsed: ${msToMinutes(periodSums.fun.current.durationElapsed)};
            
                --work-original: ${msToMinutes(periodSums.work.original.duration)};
                --work-planned: ${msToMinutes(periodSums.work.current.duration)};
                --work-elapsed: ${msToMinutes(periodSums.work.current.durationElapsed)};
            `}
        >
            <h2>Stats</h2>
            <StatsBars periodSums={periodSums} />
        </div>
    )
}
