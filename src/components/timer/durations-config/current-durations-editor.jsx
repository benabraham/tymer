import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faXmark } from '@fortawesome/free-solid-svg-icons'
import {
    currentDurationsText,
    applyCurrentDurations,
    closeDurationsPanel,
} from '../../../lib/timer'
import { AutoTextarea } from './auto-textarea'

// Live editor for the running timeline (timer is paused while this is open).
// The textarea is backed by the currentDurationsText signal: typing applies to
// the timeline live, and external changes (buttons/shortcuts) are mirrored back
// into it by an effect in timer.js. Rendering elapsed as h:mm:ss never fights
// the cursor because editor-originated applies skip that write-back.
// Format per line: <Type> <elapsed>/<total> <Note>  (elapsed omitted when 0).
export const CurrentDurationsEditor = () => {
    const handleInput = value => {
        currentDurationsText.value = value
        applyCurrentDurations(value)
    }

    return (
        <section class="durations-config">
            <div class="durations-config__list">
                <span class="durations-config__label">
                    Editing current durations — timer paused
                </span>
                <button
                    class="durations-config__chip durations-config__close"
                    aria-label="Close"
                    title="Close"
                    onClick={closeDurationsPanel}
                >
                    <FontAwesomeIcon icon={faXmark} />
                </button>
            </div>

            <div class="durations-config__editor">
                <AutoTextarea value={currentDurationsText.value} autoFocus onInput={handleInput} />
            </div>
        </section>
    )
}
