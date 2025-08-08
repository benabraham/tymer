import './build-info.scss'

export function BuildInfo() {
    // These are injected by Vite at build time
    const buildHash = typeof __BUILD_HASH__ !== 'undefined' ? __BUILD_HASH__ : 'DEV'
    const buildTime = typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : new Date().toISOString()
    
    // Format the build time to a shorter, more readable format
    const formatBuildTime = (isoString) => {
        try {
            const date = new Date(isoString)
            // Show just the date and hour:minute
            return date.toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            }).replace(',', '')
        } catch {
            return 'DEV'
        }
    }
    
    return (
        <div className="build-info" title={`Build: ${buildHash} | ${formatBuildTime(buildTime)}`}>
            <span className="build-hash">{buildHash}</span>
        </div>
    )
}