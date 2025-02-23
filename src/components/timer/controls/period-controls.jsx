import {
    adjustDuration,
    timerHasFinished,
    timerState,
    timerOnLastPeriod,
    handlePeriodCompletion,
} from '../../../timer'

export const PeriodControls = () => (
    <section class="controls">
        <div>Period</div>
        <button
            onClick={() => adjustDuration(-6 * 60 * 1000)}
            disabled={
                timerHasFinished.value ||
                timerState.value.currentPeriodIndex === null ||
                !timerState.value.periods.some(p => p.periodDurationRemaining > 0)
            }
        >
            -6 min
        </button>
        <button
            onClick={() => adjustDuration(-60 * 1000)}
            disabled={
                timerHasFinished.value ||
                timerState.value.currentPeriodIndex === null ||
                !timerState.value.periods.some(p => p.periodDurationRemaining > 0)
            }
        >
            -1 min
        </button>
        <button
            onClick={handlePeriodCompletion}
            disabled={
                timerHasFinished.value ||
                timerState.value.currentPeriodIndex === null ||
                timerOnLastPeriod.value
            }
            class={!timerOnLastPeriod.value && timerState.value.shouldGoToNextPeriod ? 'highlighted' : ''}
        >
            Next
        </button>
        <button
            onClick={() => adjustDuration(60 * 1000)}
            disabled={
                timerHasFinished.value ||
                timerState.value.currentPeriodIndex === null
            }
        >
            +1 min
        </button>
        <button
            onClick={() => adjustDuration(6 * 60 * 1000)}
            disabled={
                timerHasFinished.value ||
                timerState.value.currentPeriodIndex === null
            }
        >
            +6 min
        </button>
    </section>
) 