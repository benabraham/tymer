import { activeConfigPeriods, timerState, timerDuration, currentPeriod } from '../../../lib/timer'
import { msToMinutes, formatTime } from '../../../lib/format'
import { StatsBars } from './stats-bars'

export const Stats = () => {
    const calculateTypeSums = ({ periods, type }) => {
        const sumByKey = key =>
            periods.reduce(
                (sum, period) => (period.config.type === type ? sum + period.state[key] : sum),
                0,
            )

        return {
            duration: sumByKey('duration'),
            durationElapsed: sumByKey('elapsed'),
            durationRemaining: sumByKey('remaining'),
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
        initialPeriods: activeConfigPeriods.value,
        currentPeriods: timerState.value.periods,
    })

    const current = currentPeriod.value
    const isWorkCurrent = current?.config.type === 'work'
    const workProjectedMs = isWorkCurrent
        ? periodSums.work.current.durationElapsed + current.state.remaining
        : 0

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
                --work-projected: ${msToMinutes(workProjectedMs)};
            `}
        >
            <h2>{formatTime(timerDuration.value)} total</h2>
            <StatsBars
                periodSums={periodSums}
                workProjectedMs={isWorkCurrent ? workProjectedMs : null}
            />
        </div>
    )
}
