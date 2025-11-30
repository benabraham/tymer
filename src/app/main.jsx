import { render } from 'preact'
import './index.scss'
import { Timer } from '../components/timer/timer'
import { ThemeSwitcher } from '../components/theme-switcher/theme-switcher'
import { initTheme } from '../lib/theme'
import 'preact/debug'

// Initialize theme from localStorage before render
initTheme()

render(
    <>
        <ThemeSwitcher />
        <Timer />
    </>,
    document.getElementById('app'),
)
