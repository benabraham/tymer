import { faBroom, faStop } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { clearHeard, stopPlayback } from './playback'
import type { PreviewModel } from './preview-model'

export const SoundPreviewHeader = ({ totals }: { totals: PreviewModel['totals'] }) => (
    <header class="sound-preview__header">
        <div class="sound-preview__header-titles">
            <h1>Tymer — sound preview</h1>
            <p class="sound-preview__summary">
                {totals.events} events · {totals.sets} voice sets · {totals.takes} takes
            </p>
        </div>
        <div class="sound-preview__header-actions">
            <button
                type="button"
                class="button--xs"
                onClick={stopPlayback}
                title="Stop playback (Esc)"
            >
                <FontAwesomeIcon icon={faStop} /> Stop
            </button>
            <button
                type="button"
                class="button--xs"
                onClick={clearHeard}
                title="Clear the heard markers"
            >
                <FontAwesomeIcon icon={faBroom} /> Clear heard
            </button>
            <a href="/tymer/">&larr; Back to Tymer</a>
        </div>
    </header>
)
