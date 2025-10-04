import {
    adjustDuration,
    adjustElapsed,
    timerDurationElapsed,
    moveElapsedTimeToPreviousPeriod,
    changeType,
    addPeriod,
    removePeriod,
    canAdjustElapsed,
    canAdjustDuration,
    canAdjustElapsedForward,
    canAdjustElapsedBackward,
    canAdjustDurationForward,
    canChangeType,
    canAddPeriod,
    canRemovePeriod,
    canMoveElapsedToPrevious,
} from '../../../lib/timer'
import { SoundWrapper } from '../../common/sound-wrapper'

export const PeriodControls = () => (
    <>
        <section className="controls">
            <div class="button-group">
                <SoundWrapper
                    onClick={moveElapsedTimeToPreviousPeriod}
                    disabled={!canMoveElapsedToPrevious.value}
                >
                    move time to previous
                </SoundWrapper>
            </div>

            <div class="button-group">
                <SoundWrapper
                    onClick={() => adjustElapsed(-timerDurationElapsed.value)}
                    disabled={!canAdjustElapsedBackward.value}
                >
                    🔙
                </SoundWrapper>
                <SoundWrapper
                    onClick={() => adjustElapsed(-6 * 60 * 1000)}
                    disabled={!canAdjustElapsed(-6 * 60 * 1000)}
                >
                    &lt;--- 6 m
                </SoundWrapper>
                <SoundWrapper
                    onClick={() => adjustElapsed(-1 * 60 * 1000)}
                    disabled={!canAdjustElapsed(-1 * 60 * 1000)}
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
                    disabled={!canAdjustElapsedForward.value}
                >
                    1 m --&gt;
                </SoundWrapper>
                <SoundWrapper
                    onClick={() => adjustElapsed(6 * 60 * 1000)}
                    disabled={!canAdjustElapsedForward.value}
                >
                    6 m ---&gt;
                </SoundWrapper>
            </div>
        </section>

        <section className="controls mb-0">
            <div class="button-group">
                <SoundWrapper
                    onClick={() => adjustDuration(-6 * 60 * 1000)}
                    disabled={!canAdjustDuration(-6 * 60 * 1000)}
                >
                    ➖ 6 min
                </SoundWrapper>
                <SoundWrapper
                    onClick={() => adjustDuration(-1 * 60 * 1000)}
                    disabled={!canAdjustDuration(-1 * 60 * 1000)}
                >
                    ➖ 1 min
                </SoundWrapper>
                <SoundWrapper
                    onClick={() => adjustDuration(1 * 60 * 1000)}
                    disabled={!canAdjustDurationForward.value}
                >
                    ➕ 1 min
                </SoundWrapper>
                <SoundWrapper
                    onClick={() => adjustDuration(6 * 60 * 1000)}
                    disabled={!canAdjustDurationForward.value}
                >
                    ➕ 6 min
                </SoundWrapper>
            </div>
        </section>
        <section className="controls">
            <SoundWrapper
                onClick={changeType}
                disabled={!canChangeType.value}
            >
                change type
            </SoundWrapper>
            <div class="button-group">
                <SoundWrapper
                    onClick={addPeriod}
                    disabled={!canAddPeriod.value}
                >
                    add period
                </SoundWrapper>
                <SoundWrapper
                    onClick={removePeriod}
                    disabled={!canRemovePeriod.value}
                >
                    remove period
                </SoundWrapper>
            </div>

        </section>
    </>
)
