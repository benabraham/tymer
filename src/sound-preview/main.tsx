// biome-ignore lint/suspicious/noDeprecatedImports: only render's third replaceNode parameter is deprecated; unused here
import { render } from 'preact'
import { initTheme } from '../lib/theme'
import './index.scss'
import { SoundPreview } from './sound-preview'

// Initialize theme from localStorage before render — this page shares the
// app's color themes, not a service worker or the timer.
initTheme()

const appRoot = document.getElementById('app')
if (!appRoot) throw new Error('#app root element missing — check sounds/index.html')

render(<SoundPreview />, appRoot)
