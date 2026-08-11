import path from 'node:path'
import { soundConfig } from '../src/lib/sounds.ts'

/**
 * Extracts sound file paths from soundConfig and generates preload HTML links
 */
export function generateSoundPreloads() {
    // Extract all sound paths from the configuration
    const soundPaths = []

    Object.values(soundConfig).forEach(setConfig => {
        Object.values(setConfig).forEach(variants => {
            // Each leaf is an array of variant paths (one per interchangeable take).
            variants.forEach(path => {
                soundPaths.push(path)
            })
        })
    })

    // Remove duplicates and sort for consistent output
    const uniquePaths = [...new Set(soundPaths)].sort()

    // Generate preload HTML links
    const preloadLinks = uniquePaths
        .map(path => `        <link rel="preload" href="${path}" as="audio" type="audio/wav" />`)
        .join('\n')

    return {
        paths: uniquePaths,
        html: `        <!-- Sound preloads (auto-generated from soundConfig) -->\n${preloadLinks}`,
    }
}

/**
 * Vite plugin to inject sound preloads into HTML
 */
export function soundPreloadPlugin() {
    // Resolved from the Vite config so the main entry can be identified by
    // absolute path — `ctx.path` is a request URL in dev (base-prefixed) and a
    // root-relative path in build, so it is not comparable across both.
    let mainEntry = ''

    return {
        name: 'sound-preload',
        configResolved(config) {
            mainEntry = path.resolve(config.root, 'index.html')
        },
        transformIndexHtml: {
            order: 'pre',
            handler(html, ctx) {
                // The app entry only. The sound-preview page (sounds/index.html)
                // auditions the whole bank on demand — preloading 480 clips
                // there would download the entire bank on open.
                if (path.resolve(ctx.filename) !== mainEntry) return html

                const { html: preloadHtml } = generateSoundPreloads()

                // Find the position to insert preloads (after fonts, before icons)
                const insertPosition = html.indexOf('        <link rel="icon"')

                if (insertPosition === -1) {
                    // Fallback: insert before closing head tag
                    return html.replace('</head>', `${preloadHtml}\n    </head>`)
                }

                // Insert before the first icon link
                return (
                    html.slice(0, insertPosition)
                    + preloadHtml
                    + '\n        '
                    + html.slice(insertPosition)
                )
            },
        },
    }
}
