// Service-worker registration.
//
// Lives outside src/lib because `virtual:pwa-register` only exists while the
// Vite PWA plugin is loaded — the test environment (vitest.config.js) does not
// have it, and nothing under src/lib may depend on it.

import { registerSW } from 'virtual:pwa-register'
import { announceUpdate } from '../lib/app-update'

// The browser only re-checks sw.js on navigation, so a tab left open for days
// would never see a new deploy. Poll instead — the request bypasses the HTTP
// cache, so GitHub Pages' 10-minute max-age on sw.js cannot mask a new build.
const UPDATE_CHECK_INTERVAL_MS = 15 * 60 * 1000

export const registerServiceWorker = () => {
    registerSW({
        immediate: true,
        // In autoUpdate mode this replaces the plugin's unconditional
        // window.location.reload(); app-update.js reloads once it is safe.
        onNeedReload: announceUpdate,
        onRegisteredSW: (_swUrl, registration) => {
            if (!registration) return

            const check = () => {
                if (document.visibilityState !== 'visible') return
                if (navigator.onLine === false) return
                registration.update()
            }

            setInterval(check, UPDATE_CHECK_INTERVAL_MS)
            // Coming back to the tab (or back online) is the moment a stale
            // build is most likely and most visible.
            document.addEventListener('visibilitychange', check)
            window.addEventListener('online', check)
        },
        onRegisterError: error => console.error('service worker registration failed', error),
    })
}
