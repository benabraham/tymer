// New-deploy handling.
//
// The service worker precaches a new build in the background and takes control
// straight away (skipWaiting + clientsClaim), but the page that is already open
// keeps running the old bundle until it reloads — that reload is the piece the
// plugin's bare registration script never did, which is why a deployed change
// only showed up after a manual cache-disabled refresh.
//
// Reloading is cheap here: the session lives in localStorage and elapsed time is
// derived from wall-clock timestamps, so a reload restores exactly what was on
// screen. It is still disruptive mid-session, and it would drop half-typed text
// in the durations panel, so a pending update waits for a quiet moment.

import { computed, effect, signal } from '@preact/signals'
import { configPanelOpen } from './period-configs'
import { Schedule } from './schedule'

// A newer build is precached and active in the service worker; this page is not
// running it yet.
export const updateReady = signal(false)

const canReloadNow = computed(
    () => !configPanelOpen.value && (Schedule.isIdle.value || Schedule.isCompleted.value),
)

export const applyUpdate = () => window.location.reload()

// Called by the service-worker registration when a new build has activated.
export const announceUpdate = () => {
    updateReady.value = true
}

// Apply as soon as it is safe — immediately when nothing is running, otherwise
// the moment the session ends (Finish / Reset) or the durations panel closes.
// Until then the build-info avatar offers a manual reload.
effect(() => {
    if (updateReady.value && canReloadNow.value) applyUpdate()
})
