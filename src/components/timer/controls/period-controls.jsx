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
            <div class="button-group">
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
            </div>

            <div class="button-group">
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
                    &lt;--- 6 m
                </button>
                <button
                    onClick={() => adjustElapsed(-1 * 60 * 1000)}
                    disabled={
                        timerState.value.currentPeriodIndex === null || timerDurationElapsed.value === 0
                    }
                >
                    &lt;-- 1 m
                </button>
                {/*<button
                onClick={() => adjustElapsed(-12 * 1000)}
                disabled={
                    timerState.value.currentPeriodIndex === null || timerDurationElapsed.value === 0
                }
            >
                &lt;- 12 s
            </button>
            <button
                onClick={() => adjustElapsed(12 * 1000)}
                disabled={timerState.value.currentPeriodIndex === null}
            >
                12 s -&gt;
            </button>*/}
                <button
                    onClick={() => adjustElapsed(1 * 60 * 1000)}
                    disabled={timerState.value.currentPeriodIndex === null}
                >
                    1 m --&gt;
                </button>
                <button
                    onClick={() => adjustElapsed(6 * 60 * 1000)}
                    disabled={timerState.value.currentPeriodIndex === null}
                >
                    6 m ---&gt;
                </button>
            </div>
        </section>
        <section class="controls mb-0">
            <div class="button-group">
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
            </div>
        </section>
        <section class="controls">
            <button onClick={changeType} disabled={timerState.value.currentPeriodIndex === null}>
                change type
            </button>
            <div class="button-group">
                <button onClick={addPeriod} disabled={timerState.value.currentPeriodIndex === null}>
                    add period
                </button>
                <button
                    onClick={removePeriod}
                    disabled={
                        timerState.value.currentPeriodIndex === null
                        || timerState.value.periods.length <= 1
                    }
                >
                    remove period
                </button>
            </div>
        </section>
    </>
)
