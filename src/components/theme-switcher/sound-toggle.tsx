import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faVolumeHigh, faVolumeXmark } from '@fortawesome/free-solid-svg-icons'
import { soundEnabled, audioUnlocked, toggleSound, unlockAudio } from '../../lib/sounds'

// Mute toggle. Three visual states, matching the other top-controls toggles:
//   on + audio activated   → active (accent background)
//   on + not yet activated → warning (orange background — browser still blocks playback)
//   muted                  → inactive (dimmed, crossed-out speaker)
export const SoundToggle = () => {
    const isMuted = !soundEnabled.value
    const isLocked = !audioUnlocked.value

    const handleClick = async () => {
        // Unmuting is a user gesture — a good moment to unlock the audio context.
        if (isMuted) await unlockAudio()
        toggleSound()
    }

    const title = isMuted
        ? 'Sound off — click or press M to unmute'
        : isLocked
          ? 'Sound on, but audio is not activated yet — interact with the page'
          : 'Sound on — click or press M to mute'

    return (
        <button
            class={`top-controls__button ${isMuted ? '' : isLocked ? 'top-controls__button--warning' : 'top-controls__button--active'}`}
            onClick={handleClick}
            title={title}
            aria-label={title}
            aria-pressed={isMuted}
        >
            <FontAwesomeIcon icon={isMuted ? faVolumeXmark : faVolumeHigh} />
        </button>
    )
}
