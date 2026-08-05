import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faMasksTheater } from '@fortawesome/free-solid-svg-icons'
import {
    ALL_SETS,
    soundSetOptions,
    activeSoundSet,
    cycleSoundSet,
    soundSetLabel,
} from '../../lib/sound-set'

// Cycles through the available voice sets (all + one per pack). Renders every
// option's label stacked in the same grid cell (see .sound-set-switcher__label
// in theme-switcher.scss) so the button never resizes as the active label changes.
export const SoundSetSwitcher = () => {
    const active = activeSoundSet.value
    const isPinned = active !== ALL_SETS
    const label = soundSetLabel(active)

    const title = `Voice set: ${label} — click or press V to cycle`

    return (
        <button
            class={`top-controls__button sound-set-switcher ${isPinned ? 'top-controls__button--active' : ''}`}
            onClick={cycleSoundSet}
            title={title}
            aria-label={title}
        >
            <FontAwesomeIcon icon={faMasksTheater} />
            <span class="sound-set-switcher__labels">
                {soundSetOptions.map(name => (
                    <span
                        key={name}
                        class={`sound-set-switcher__label ${name === active ? 'sound-set-switcher__label--active' : ''}`}
                        aria-hidden={name !== active}
                    >
                        {soundSetLabel(name)}
                    </span>
                ))}
            </span>
        </button>
    )
}
