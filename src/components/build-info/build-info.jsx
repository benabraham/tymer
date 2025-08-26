import './build-info.scss'

export function BuildInfo() {
    // These are injected by Vite at build time
    const buildAvatar = typeof __BUILD_AVATAR__ !== 'undefined' ? __BUILD_AVATAR__ : 'DEV'

    return <div class="build-info">{buildAvatar}</div>
}
