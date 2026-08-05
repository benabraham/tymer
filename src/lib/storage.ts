import { log } from './log.js'
import type { PeriodData } from './period.js'
import type { ScheduleSnapshot } from './schedule.js'

// Function to save the timer state to localStorage
export const saveState = <T extends Record<string, unknown>>(state: T): T => {
    // Convert the state object to a JSON string and store it in localStorage
    localStorage.setItem('timerState', JSON.stringify(state))
    //log('state saved', state, 0)
    return state
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null

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
export const loadState = <TTimerState extends { periods: PeriodData[] } & Record<string, unknown>>(
    initialTimerState: TTimerState,
    initialScheduleSnapshot: ScheduleSnapshot,
): { timerState: TTimerState; scheduleSnapshot: ScheduleSnapshot } => {
    try {
        // localStorage genuinely returns string | null (key absent), and the
        // persisted blob genuinely may be malformed JSON — both fall through to
        // the catch block below (or fail isValidState), matching the original
        // behavior of JSON.parse(null) coercing to the JS value `null`.
        const raw = localStorage.getItem('timerState')
        const loadedState: unknown = raw === null ? null : JSON.parse(raw)

        // Validate timer-state keys
        const timerKeys = Object.keys(initialTimerState)
        // Validate schedule-snapshot keys
        const scheduleKeys = Object.keys(initialScheduleSnapshot)

        const isValidState =
            isRecord(loadedState)
            && timerKeys.every(prop => Object.hasOwn(loadedState, prop))
            && scheduleKeys.every(prop => Object.hasOwn(loadedState, prop))
            && Array.isArray(loadedState.periods)
            && loadedState.periods.every(p => {
                const period = p as { config?: unknown; state?: unknown } | null | undefined
                return Boolean(period?.config && period?.state)
            })

        if (isValidState && isRecord(loadedState)) {
            // Extract each slice from the flat persisted blob. isValidState is
            // what actually guarantees the required keys (and the Period shape)
            // are present — the compiler can't verify the key-subset reduce
            // against TTimerState / ScheduleSnapshot structurally, hence the casts.
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
            ) as ScheduleSnapshot

            log('state loaded successfully', loadedState, 1)
            return { timerState, scheduleSnapshot }
        } else {
            log('loaded state was invalid, initial state returned', initialTimerState, 2)
            return { timerState: initialTimerState, scheduleSnapshot: initialScheduleSnapshot }
        }
    } catch {
        log('initial state saved (there was an error loading the state)', initialTimerState, 3)
        return { timerState: initialTimerState, scheduleSnapshot: initialScheduleSnapshot }
    }
}
