import { useState } from 'preact/hooks'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
    faSun,
    faSnowflake,
    faBug,
    faClock,
    faThumbtack,
    faCompress,
} from '@fortawesome/free-solid-svg-icons'
import { getTheme, cycleTheme } from '../../lib/theme'
import { debugVisible, toggleDebug } from '../../lib/debug'
import { clocksVisible, toggleClocks } from '../../lib/clocks'
import { compactMode, toggleCompact } from '../../lib/compact'
import { canTogglePin, togglePinTimer } from '../../lib/timer'
import { Schedule } from '../../lib/schedule'
import { SoundToggle } from './sound-toggle'
import './theme-switcher.scss'

export const ThemeSwitcher = () => {
    const [currentTheme, setCurrentTheme] = useState(getTheme())

    const handleThemeClick = () => {
        const nextTheme = cycleTheme()
        setCurrentTheme(nextTheme)
    }

    const themeIcon = currentTheme === 'nord' ? faSnowflake : faSun

    const isAnchored = Schedule.isAnchored.value
    const pinTitle = isAnchored ? 'Unpin start time (P)' : 'Pin start time (P)'

    return (
        <div class="top-controls">
            <SoundToggle />
            <button
                class="top-controls__button"
                onClick={handleThemeClick}
                title={`Theme: ${currentTheme}`}
                aria-label={`Current theme: ${currentTheme}. Click to switch theme.`}
            >
                <FontAwesomeIcon icon={themeIcon} />
            </button>
            <button
                class={`top-controls__button ${clocksVisible.value ? 'top-controls__button--active' : ''}`}
                onClick={toggleClocks}
                title="Toggle absolute times"
                aria-label="Toggle absolute times"
            >
                <FontAwesomeIcon icon={faClock} />
            </button>
            <button
                class={`top-controls__button ${compactMode.value ? 'top-controls__button--active' : ''}`}
                onClick={toggleCompact}
                title="Toggle compact mode"
                aria-label="Toggle compact mode"
                aria-pressed={compactMode.value}
            >
                <FontAwesomeIcon icon={faCompress} />
            </button>
            <button
                class={`top-controls__button ${debugVisible.value ? 'top-controls__button--active' : ''}`}
                onClick={toggleDebug}
                title="Toggle debugging info"
                aria-label="Toggle debugging info"
            >
                <FontAwesomeIcon icon={faBug} />
            </button>
            <button
                class={`top-controls__button ${isAnchored ? 'top-controls__button--active' : ''}`}
                onClick={togglePinTimer}
                disabled={!canTogglePin.value}
                title={pinTitle}
                aria-label={pinTitle}
                aria-pressed={isAnchored}
            >
                <FontAwesomeIcon icon={faThumbtack} />
            </button>
        </div>
    )
}
