import { useState } from 'preact/hooks'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faSun, faSnowflake, faBug, faClock } from '@fortawesome/free-solid-svg-icons'
import { getTheme, cycleTheme } from '../../lib/theme'
import { debugVisible, toggleDebug } from '../../lib/debug'
import { clocksVisible, toggleClocks } from '../../lib/clocks'
import './theme-switcher.scss'

export const ThemeSwitcher = () => {
    const [currentTheme, setCurrentTheme] = useState(getTheme())

    const handleThemeClick = () => {
        const nextTheme = cycleTheme()
        setCurrentTheme(nextTheme)
    }

    const themeIcon = currentTheme === 'nord' ? faSnowflake : faSun

    return (
        <div class="top-controls">
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
                class={`top-controls__button ${debugVisible.value ? 'top-controls__button--active' : ''}`}
                onClick={toggleDebug}
                title="Toggle debugging info"
                aria-label="Toggle debugging info"
            >
                <FontAwesomeIcon icon={faBug} />
            </button>
        </div>
    )
}
