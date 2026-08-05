import { log } from './log.js'

// Function to save the timer state to localStorage
export const saveState = <T>(state: T): T => {
    // Convert the state object to a JSON string and store it in localStorage
    localStorage.setItem('timerState', JSON.stringify(state))
    //log('state saved', state, 0)
    return state
}

// Function to load the timer state from localStorage.
//
// Accepts two initial-state objects:
//   initialTimerState    — the { periods, types } shape owned by timerState signal
//   initialScheduleSnapshot — the { phase, currentPeriodIndex, timestampStarted, timestampPaused }
//                             shape owned by Schedule
//
// Returns { timerState, scheduleSnapshot } so the caller can hydrate each signal
// independently.  Extra keys in the persisted blob beyond the required ones are
// allowed — they are silently ignored.
//
// Falls back to defaults for the entire blob if any required key is missing or
// if the Period shape is stale (no backward-compat migration — just reset).
export const loadState = <
    TTimerState extends Record<string, unknown>,
    TScheduleSnapshot extends Record<string, unknown>,
>(
    initialTimerState: TTimerState,
    initialScheduleSnapshot: TScheduleSnapshot,
): { timerState: TTimerState; scheduleSnapshot: TScheduleSnapshot } => {
    try {
        // Attempt to retrieve and parse the state from localStorage
        const loadedState = JSON.parse(localStorage.getItem('timerState') as string) as Record<
            string,
            unknown
        >

        // Validate timer-state keys
        const timerKeys = Object.keys(initialTimerState)
        // Validate schedule-snapshot keys
        const scheduleKeys = Object.keys(initialScheduleSnapshot)

        const isValidState =
            timerKeys.every(prop => loadedState.hasOwnProperty(prop))
            && scheduleKeys.every(prop => loadedState.hasOwnProperty(prop))
            && Array.isArray(loadedState.periods)
            && (loadedState.periods as unknown[]).every(p => {
                const period = p as { config?: unknown; state?: unknown } | null | undefined
                return Boolean(period?.config && period?.state)
            })

        if (isValidState) {
            // Extract each slice from the flat persisted blob
            const timerState = timerKeys.reduce(
                (acc, key) => {
                    acc[key] = loadedState[key]
                    return acc
                },
                {} as Record<string, unknown>,
            ) as TTimerState
            const scheduleSnapshot = scheduleKeys.reduce(
                (acc, key) => {
                    acc[key] = loadedState[key]
                    return acc
                },
                {} as Record<string, unknown>,
            ) as TScheduleSnapshot

            log('state loaded successfully', loadedState, 1)
            return { timerState, scheduleSnapshot }
        } else {
            log('loaded state was invalid, initial state returned', initialTimerState, 2)
            return { timerState: initialTimerState, scheduleSnapshot: initialScheduleSnapshot }
        }
    } catch (error) {
        log('initial state saved (there was an error loading the state)', initialTimerState, 3)
        return { timerState: initialTimerState, scheduleSnapshot: initialScheduleSnapshot }
    }
}
