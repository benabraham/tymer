import { soundConfig } from '../src/lib/sounds.js'

/**
 * Extracts sound file paths from soundConfig and generates preload HTML links
 */
export function generateSoundPreloads() {
    // Extract all sound paths from the configuration
    const soundPaths = []
    
    Object.values(soundConfig).forEach(setConfig => {
        Object.values(setConfig).forEach(path => {
            soundPaths.push(path)
        })
    })
    
    // Remove duplicates and sort for consistent output
    const uniquePaths = [...new Set(soundPaths)].sort()
    
    // Generate preload HTML links
    const preloadLinks = uniquePaths.map(path => 
        `        <link rel="preload" href="${path}" as="audio" type="audio/wav" />`
    ).join('\n')
    
    return {
        paths: uniquePaths,
        html: `        <!-- Sound preloads (auto-generated from soundConfig) -->\n${preloadLinks}`
    }
}

/**
 * Vite plugin to inject sound preloads into HTML
 */
export function soundPreloadPlugin() {
    return {
        name: 'sound-preload',
        transformIndexHtml: {
            order: 'pre',
            handler(html) {
                const { html: preloadHtml } = generateSoundPreloads()
                
                // Find the position to insert preloads (after fonts, before icons)
                const insertPosition = html.indexOf('        <link rel="icon"')
                
                if (insertPosition === -1) {
                    // Fallback: insert before closing head tag
                    return html.replace('</head>', `${preloadHtml}\n    </head>`)
                }
                
                // Insert before the first icon link
                return html.slice(0, insertPosition) + 
                       preloadHtml + '\n        ' + 
                       html.slice(insertPosition)
            }
        }
    }
}