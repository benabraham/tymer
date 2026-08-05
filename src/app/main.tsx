// biome-ignore lint/suspicious/noDeprecatedImports: only render's third replaceNode parameter is deprecated; unused here
import { render } from 'preact'
import './index.scss'
import { ThemeSwitcher } from '../components/theme-switcher/theme-switcher'
import { Timer } from '../components/timer/timer'
import { initTheme } from '../lib/theme'
import { registerServiceWorker } from './register-sw'
import 'preact/debug'

// Initialize theme from localStorage before render
initTheme()

// Picks up new deploys and reloads when the session is idle
registerServiceWorker()

const appRoot = document.getElementById('app')
if (!appRoot) throw new Error('#app root element missing — check index.html')

render(
    <>
        <ThemeSwitcher />
        <Timer />
    </>,
    appRoot,
)
