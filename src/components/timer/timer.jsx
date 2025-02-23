import { useEffect } from 'preact/hooks'
import { initializeTimer } from '../../timer'
import { Timeline } from './timeline/timeline'
import { TimerControls } from './controls/timer-controls'
import { PeriodControls } from './controls/period-controls'
import { Stats } from './stats/stats'
import { DebuggingInfo } from './debug/debugging-info'

export function Timer() {
    useEffect(() => {
        initializeTimer()
    }, [])

    return (<>
        <Timeline />
        <TimerControls />
        <PeriodControls />
        <Stats />
        <DebuggingInfo />
    </>)
} 