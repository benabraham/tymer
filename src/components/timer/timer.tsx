import { useSignalEffect } from '@preact/signals'
import { useEffect } from 'preact/hooks'
import { compactMode } from '../../lib/compact'
import { debugVisible } from '../../lib/debug'
import { documentTitle } from '../../lib/document-title'
import { unlockAudio } from '../../lib/sounds'
import { initializeTimer } from '../../lib/timer'
import { BuildInfo } from '../build-info/build-info'
import { PeriodControls } from './controls/period-controls'
import { TimerControls } from './controls/timer-controls'
import { DebuggingInfo } from './debug/debugging-info'
import { DurationsConfigPanel } from './durations-config/durations-config-panel'
import { KeyboardShortcuts } from './keyboard-shortcuts'
import { Stats } from './stats/stats'
import { Timeline } from './timeline/timeline'

export function Timer() {
    useEffect(() => {
        initializeTimer()
    }, [])

    // Global audio unlock on any user interaction for PWA
    useEffect(() => {
        const unlockOnInteraction = async () => {
            await unlockAudio()
        }

        // Listen for multiple interaction types to ensure audio unlock
        const events = ['click', 'touchstart', 'keydown']
        events.forEach(event => {
            document.addEventListener(event, unlockOnInteraction, { once: true })
        })

        return () => {
            events.forEach(event => {
                document.removeEventListener(event, unlockOnInteraction)
            })
        }
    }, [])

    // Keep the browser tab title in sync — the string itself is derived in
    // `src/lib/document-title.ts`.
    useSignalEffect(() => {
        document.title = documentTitle.value
    })

    return (
        <>
            <KeyboardShortcuts />
            <BuildInfo />
            <TimerControls />
            <DurationsConfigPanel />
            <Timeline />
            {!compactMode.value && <PeriodControls />}
            <Stats />
            {debugVisible.value && <DebuggingInfo />}
        </>
    )
}
