import {
    adjustDuration,
    timerHasFinished,
    timerState,
    timerOnLastPeriod,
    moveToNextPeriod,
    moveToPreviousPeriod,
} from '../../../lib/timer'

export const PeriodControls = () => (
    <section class="controls">
        <div>Current period</div>
        <button
            onClick={() => adjustDuration(-6 * 60 * 1000)}
            disabled={
                timerHasFinished.value
                || timerState.value.currentPeriodIndex === null
                || !timerState.value.periods.some(p => p.periodDurationRemaining > 0)
            }
        >
            ➖6 min
        </button>
        <button
            onClick={() => adjustDuration(-1 * 60 * 1000)}
            disabled={
                timerHasFinished.value
                || timerState.value.currentPeriodIndex === null
                || !timerState.value.periods.some(p => p.periodDurationRemaining > 0)
            }
        >
            ➖1 min
        </button>
        <button
            onClick={moveToPreviousPeriod}
            disabled={
                timerHasFinished.value
                || timerState.value.currentPeriodIndex === null
                || timerState.value.currentPeriodIndex === 0
            }
        >
            ⏮️
        </button>
        <button
            onClick={moveToNextPeriod}
            disabled={
                timerHasFinished.value
                || timerState.value.currentPeriodIndex === null
                || timerOnLastPeriod.value
            }
            class={
                !timerOnLastPeriod.value && timerState.value.shouldGoToNextPeriod
                    ? 'highlighted'
                    : ''
            }
        >
            ⏭️
        </button>
        <button
            onClick={() => adjustDuration(1 * 60 * 1000)}
            disabled={timerHasFinished.value || timerState.value.currentPeriodIndex === null}
        >
            ➕1 min
        </button>
        <button
            onClick={() => adjustDuration(6 * 60 * 1000)}
            disabled={timerHasFinished.value || timerState.value.currentPeriodIndex === null}
        >
            ➕6 min
        </button>
    </section>
)
