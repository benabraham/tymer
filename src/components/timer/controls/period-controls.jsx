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
import { SoundWrapper } from '../../common/sound-wrapper'

export const PeriodControls = () => (
    <>
        <section className="controls">
            <div class="button-group">
                <SoundWrapper
                    onClick={moveElapsedTimeToPreviousPeriod}
                    disabled={
                        timerState.value.currentPeriodIndex === null
                        || timerDurationElapsed.value === 0
                        || timerState.value.currentPeriodIndex === 0
                    }
                >
                    move time to previous
                </SoundWrapper>
            </div>

            <div class="button-group">
                <SoundWrapper
                    onClick={() => adjustElapsed(-timerDurationElapsed.value)}
                    disabled={
                        timerState.value.currentPeriodIndex === null
                        || timerDurationElapsed.value === 0
                    }
                >
                    🔙
                </SoundWrapper>
                <SoundWrapper
                    onClick={() => adjustElapsed(-6 * 60 * 1000)}
                    disabled={
                        timerState.value.currentPeriodIndex === null
                        || timerDurationElapsed.value === 0
                    }
                >
                    &lt;--- 6 m
                </SoundWrapper>
                <SoundWrapper
                    onClick={() => adjustElapsed(-1 * 60 * 1000)}
                    disabled={
                        timerState.value.currentPeriodIndex === null
                        || timerDurationElapsed.value === 0
                    }
                >
                    &lt;-- 1 m
                </SoundWrapper>
                {/*<SoundWrapper
                onClick={() => adjustElapsed(-12 * 1000)}
                disabled={
                    timerState.value.currentPeriodIndex === null || timerDurationElapsed.value === 0
                }
            >
                &lt;- 12 s
            </SoundWrapper>
            <SoundWrapper
                onClick={() => adjustElapsed(12 * 1000)}
                disabled={timerState.value.currentPeriodIndex === null}
            >
                12 s -&gt;
            </SoundWrapper>*/}
                <SoundWrapper
                    onClick={() => adjustElapsed(1 * 60 * 1000)}
                    disabled={timerState.value.currentPeriodIndex === null}
                >
                    1 m --&gt;
                </SoundWrapper>
                <SoundWrapper
                    onClick={() => adjustElapsed(6 * 60 * 1000)}
                    disabled={timerState.value.currentPeriodIndex === null}
                >
                    6 m ---&gt;
                </SoundWrapper>
            </div>
        </section>

        <section className="controls mb-0">
            <div class="button-group">
                <SoundWrapper
                    onClick={() => adjustDuration(-6 * 60 * 1000)}
                    disabled={
                        timerHasFinished.value
                        || timerState.value.currentPeriodIndex === null
                        || !timerState.value.periods.some(p => p.periodDurationRemaining > 0)
                        || currentPeriod.value.periodDurationRemaining < 2 * 60 * 1000
                    }
                >
                    ➖ 6 min
                </SoundWrapper>
                <SoundWrapper
                    onClick={() => adjustDuration(-1 * 60 * 1000)}
                    disabled={
                        timerHasFinished.value
                        || timerState.value.currentPeriodIndex === null
                        || !timerState.value.periods.some(p => p.periodDurationRemaining > 0)
                        || currentPeriod.value.periodDurationRemaining < 1 * 60 * 1000
                    }
                >
                    ➖ 1 min
                </SoundWrapper>
                <SoundWrapper
                    onClick={() => adjustDuration(1 * 60 * 1000)}
                    disabled={
                        timerHasFinished.value || timerState.value.currentPeriodIndex === null
                    }
                >
                    ➕ 1 min
                </SoundWrapper>
                <SoundWrapper
                    onClick={() => adjustDuration(6 * 60 * 1000)}
                    disabled={
                        timerHasFinished.value || timerState.value.currentPeriodIndex === null
                    }
                >
                    ➕ 6 min
                </SoundWrapper>
            </div>
        </section>
        <section className="controls">
            <SoundWrapper
                onClick={changeType}
                disabled={timerState.value.currentPeriodIndex === null}
            >
                change type
            </SoundWrapper>
            <div class="button-group">
                <SoundWrapper
                    onClick={addPeriod}
                    disabled={timerState.value.currentPeriodIndex === null}
                >
                    add period
                </SoundWrapper>
                <SoundWrapper
                    onClick={removePeriod}
                    disabled={
                        timerState.value.currentPeriodIndex === null
                        || timerState.value.periods.length <= 1
                    }
                >
                    remove period
                </SoundWrapper>
            </div>

        </section>
    </>
)
