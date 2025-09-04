import { formatTime } from '../../../lib/format'
import {
    timerDuration,
    timerDurationElapsed,
    timerDurationRemaining,
    timerState,
    timerOnLastPeriod,
    timerHasFinished,
    shouldGoToNextPeriod,
} from '../../../lib/timer'
import { PeriodDetails } from './period-details'

export const DebuggingInfo = () => {
    return (
        <details>
            <summary>Debugging values</summary>
            <p>
                <code>timerDuration</code> {formatTime(timerDuration.value, false, false, true)}
                <br />
                <code>timerDurationElapsed </code>{' '}
                {formatTime(timerDurationElapsed.value, true, false, true)}
                <br />
                <code>timerDurationRemaining </code>{' '}
                {formatTime(timerDurationRemaining.value, false, true, true)}
                <br />
                <code>currentPeriodIndex </code> {timerState.value.currentPeriodIndex}
                <br />
                <code>timestampStarted </code>{' '}
                {(timerState.value.timestampStarted || 0).toLocaleString()}
                <br />
                <code>timestampPaused </code>{' '}
                {(timerState.value.timestampPaused || 0).toLocaleString()}
                <br />
                <code>shouldGoToNextPeriod </code> {shouldGoToNextPeriod.value ? 'YES' : 'no'}
                <br />
                <code>timerOnLastPeriod </code> {timerOnLastPeriod.value ? 'YES' : 'no'}
                <br />
                <code>timerHasFinished </code> {timerHasFinished.value ? 'YES' : 'no'}
            </p>

            <PeriodDetails />

            <hr style={{ margin: '16px 0', borderColor: '#ddd' }} />

            <div class="button-group">
                <button>1 h</button>
                <button>2 h</button>
                <button>3 h</button>
                <button>4 h</button>
            </div>
            <br />
            <div class="button-group">
                <button class="button--xs">3</button>
                <button class="button--sm">6</button>
                <button class="button--xs">9</button>
                <button>12</button>
                <button class="button--xs">15</button>
                <button class="button--sm">18</button>
                <button class="button--xs">21</button>
                <button>24</button>
                <button class="button--xs">27</button>
                <button class="button--sm">30</button>
                <button class="button--xs">33</button>
                <button>36</button>
                <button class="button--xs">39</button>
                <button class="button--sm">42</button>
                <button class="button--xs">45</button>
                <button>48</button>
                <button class="button--xs">51</button>
                <button class="button--sm">54</button>
                <button class="button--xs">57</button>
            </div>
        </details>
    )
}
