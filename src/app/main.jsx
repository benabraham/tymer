import { render } from 'preact'
import './index.scss'
import { Timer } from '../components/timer/timer'
import { ThemeSwitcher } from '../components/theme-switcher/theme-switcher'
import { initTheme } from '../lib/theme'
import { registerServiceWorker } from './register-sw'
import 'preact/debug'

// Initialize theme from localStorage before render
initTheme()

// Picks up new deploys and reloads when the session is idle
registerServiceWorker()

render(
    <>
        <ThemeSwitcher />
        <Timer />
    </>,
    document.getElementById('app'),
)
