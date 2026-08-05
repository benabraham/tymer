import { updateReady, applyUpdate } from '../../lib/app-update'
import './build-info.scss'

export function BuildInfo() {
    // These are injected by Vite at build time
    const buildAvatar = typeof __BUILD_AVATAR__ !== 'undefined' ? __BUILD_AVATAR__ : 'DEV'
    const buildCommit = typeof __BUILD_COMMIT__ !== 'undefined' ? __BUILD_COMMIT__ : 'dev'
    const buildTime = typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : 'unbuilt'
    const buildLabel = `build ${buildCommit} · ${buildTime}`

    // A new build is precached but the session is busy — offer the reload
    // instead of yanking the page out from under a running timer.
    if (updateReady.value) {
        return (
            <button
                class="build-info build-info--update"
                title={`New version ready — click to reload (running ${buildLabel})`}
                onClick={applyUpdate}
            >
                {buildAvatar}
            </button>
        )
    }

    return (
        <div class="build-info" title={buildLabel}>
            {buildAvatar}
        </div>
    )
}
