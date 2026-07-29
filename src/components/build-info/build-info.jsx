import { updateReady, applyUpdate } from '../../lib/app-update'
import './build-info.scss'

export function BuildInfo() {
    // These are injected by Vite at build time
    const buildAvatar = typeof __BUILD_AVATAR__ !== 'undefined' ? __BUILD_AVATAR__ : 'DEV'
    const buildCommit = typeof __BUILD_COMMIT__ !== 'undefined' ? __BUILD_COMMIT__ : 'dev'
    const buildTime = typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : 'unbuilt'
    const buildLabel = `build ${buildCommit} · ${buildTime}`

    // A new build is precached but the session is busy — offer the reload
    // instead of yanking the page out from under a running timer. The avatar
    // stays the same element with the same geometry (only its opacity pulses),
    // so nothing on screen moves when an update lands.
    const pending = updateReady.value

    return (
        <div class="build-info">
            <div
                class={`build-info__avatar${pending ? ' build-info__avatar--pending' : ''}`}
                title={buildLabel}
            >
                {buildAvatar}
            </div>

            {pending && (
                <div class="build-info__update" role="status">
                    <span class="build-info__update-text">Update available</span>
                    <button class="build-info__reload" onClick={applyUpdate}>
                        Reload now
                    </button>
                </div>
            )}
        </div>
    )
}
