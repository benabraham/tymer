import {
    adjustDuration,
    timerHasFinished,
    timerState,
    adjustElapsed,
    timerDurationElapsed,
    moveElapsedTimeToPreviousPeriod,
    changeType,
    currentPeriod,
    addPeriod,
    removePeriod,
} from '../../../lib/timer'

export const PeriodControls = () => (
    <>
        <section class="controls">
            <button
                onClick={moveElapsedTimeToPreviousPeriod}
                disabled={
                    timerState.value.currentPeriodIndex === null
                    || timerDurationElapsed.value === 0
                    || timerState.value.currentPeriodIndex === 0
                }
            >
                move time to previous
            </button>
            <button
                onClick={() => adjustElapsed(-timerDurationElapsed.value)}
                disabled={
                    timerState.value.currentPeriodIndex === null || timerDurationElapsed.value === 0
                }
            >
                🔙
            </button>
            <button
                onClick={() => adjustElapsed(-6 * 60 * 1000)}
                disabled={
                    timerState.value.currentPeriodIndex === null || timerDurationElapsed.value === 0
                }
            >
                ⏪ 6 min
            </button>
            <button
                onClick={() => adjustElapsed(-1 * 60 * 1000)}
                disabled={
                    timerState.value.currentPeriodIndex === null || timerDurationElapsed.value === 0
                }
            >
                ⏪ 1 min
            </button>

            <button
                onClick={() => adjustElapsed(1 * 60 * 1000)}
                disabled={timerState.value.currentPeriodIndex === null}
            >
                1 min ⏩
            </button>
            <button
                onClick={() => adjustElapsed(6 * 60 * 1000)}
                disabled={timerState.value.currentPeriodIndex === null}
            >
                6 min ⏩
            </button>
        </section>
        <section class="controls">
            <button
                onClick={() => adjustDuration(-6 * 60 * 1000)}
                disabled={
                    timerHasFinished.value
                    || timerState.value.currentPeriodIndex === null
                    || !timerState.value.periods.some(p => p.periodDurationRemaining > 0)
                    || currentPeriod.value.periodDurationRemaining < 2 * 60 * 1000
                }
            >
                ➖ 6 min
            </button>
            <button
                onClick={() => adjustDuration(-1 * 60 * 1000)}
                disabled={
                    timerHasFinished.value
                    || timerState.value.currentPeriodIndex === null
                    || !timerState.value.periods.some(p => p.periodDurationRemaining > 0)
                    || currentPeriod.value.periodDurationRemaining < 1 * 60 * 1000
                }
            >
                ➖ 1 min
            </button>
            <button
                onClick={() => adjustDuration(1 * 60 * 1000)}
                disabled={timerHasFinished.value || timerState.value.currentPeriodIndex === null}
            >
                ➕ 1 min
            </button>
            <button
                onClick={() => adjustDuration(6 * 60 * 1000)}
                disabled={timerHasFinished.value || timerState.value.currentPeriodIndex === null}
            >
                ➕ 6 min
            </button>
            <button onClick={changeType} disabled={timerState.value.currentPeriodIndex === null}>
                change type
            </button>
            <button 
                onClick={addPeriod} 
                disabled={timerState.value.currentPeriodIndex === null}
            >
                add period
            </button>
            <button 
                onClick={removePeriod} 
                disabled={
                    timerState.value.currentPeriodIndex === null || 
                    timerState.value.periods.length <= 1
                }
            >
                remove period
            </button>
        </section>
    </>
)
