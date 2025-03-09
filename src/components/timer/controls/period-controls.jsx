import {
    adjustDuration,
    timerHasFinished,
    timerState,
    adjustElapsed,
    timerDurationElapsed,
    moveElapsedTimeToPreviousPeriod,
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
        </section>
    </>
)
