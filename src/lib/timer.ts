import { batch, computed, effect, type ReadonlySignal, type Signal, signal } from '@preact/signals'
import { DURATION_TO_ADD_AUTOMATICALLY, MIN_PERIOD_MS, PERIOD_CONFIG } from './config.js'
import {
    applyDeadlinesFromText,
    deadlineNow,
    nearestDeadlineAfter,
    serializeDeadlineLines,
} from './deadline'
import {
    hasAnchorLine,
    parseCurrentDurationsText,
    parseDurationsAnchor,
    serializeCurrentDurations,
} from './durations-format'
import type { ParsedDurationsAnchor } from './durations-format.js'
import { formatDayMarker } from './format'
import { log } from './log.js'
import { Period } from './period'
import type { PeriodData, PeriodType } from './period.js'
import {
    activeConfig,
    configPanelOpen,
    parseConfigAnchor,
    parseConfigText,
    selectConfig,
} from './period-configs'
import { Periods } from './periods'
import { Schedule } from './schedule'
import type { ScheduleSnapshot } from './schedule.js'
import { AVAILABLE_SOUNDS } from './sound-discovery'
import { SoundScheduler } from './sound-scheduler'
import { getSoundKeyFromPath, playPeriodSound, playSound, playTimerFinishedSound } from './sounds'
import { loadState, saveState } from './storage'

// The { periods, types } shape owned by the timerState signal — Schedule owns
// phase/timestamps/index separately (see ScheduleSnapshot).
type TimerState = {
    types: PeriodType[]
    periods: PeriodData[]
}

// Local helpers: convert between epoch ms and "minutes since local midnight".
// Used by the `@h:mm` anchor line (live editor + configs).
const todayAtMinutes = (minutes: number): number => {
    const date = new Date()
    date.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0)
    return date.getTime()
}

const msToMinutesSinceMidnight = (ms: number): number => {
    const date = new Date(ms)
    return date.getHours() * 60 + date.getMinutes()
}

// Resolve a parsed anchor ({ minutes, day }) from the live editor to a
// concrete timestamp. A plain time means that time on `reference`'s day —
// NEVER yesterday: crossing midnight requires an explicit qualifier, so a
// typo'd time resolves to the (invalid) future instead of silently injecting
// hours from yesterday. 'yesterday' is explicit day-stepping (setDate keeps
// the wall-clock time exact across DST changes); an explicit day+month means
// its most recent occurrence within the past year — setMonth(m, d) sets both
// fields atomically, avoiding intermediate month-length overflow. Whether the
// result is actually usable (lies far enough in the past) is the caller's
// validity check.
const resolveTypedAnchor = ({ minutes, day }: ParsedDurationsAnchor, reference: number): number => {
    if (day === 'yesterday') {
        const date = new Date(reference)
        date.setDate(date.getDate() - 1)
        date.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0)
        return date.getTime()
    }
    if (day) {
        const date = new Date(reference)
        date.setMonth(day.monthIndex, day.day)
        date.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0)
        if (date.getTime() > reference) date.setFullYear(date.getFullYear() - 1)
        return date.getTime()
    }
    const date = new Date(reference)
    date.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0)
    return date.getTime()
}

// default timer configuration — periods and types only; Schedule owns phase/timestamps/index
export const initialState: TimerState = {
    types: ['work', 'break', 'fun'],
    periods: PERIOD_CONFIG.map(({ duration, type, note }) =>
        Period.create({ type, note, durationMs: duration }),
    ),
}

const initialScheduleSnapshot: ScheduleSnapshot = {
    phase: 'idle',
    currentPeriodIndex: null,
    timestampStarted: null,
    timestampPaused: null,
    timestampAnchor: null,
}

// Boot: load persisted state (or fall back to defaults), hydrate both signals
const loaded = loadState(initialState, initialScheduleSnapshot)
export const timerState: Signal<TimerState> = signal(loaded.timerState)
Schedule.setSnapshot(loaded.scheduleSnapshot)

// Helper: build a log-friendly snapshot that includes the Schedule fields so
// log.js can detect the timer-state shape and format timestamps correctly.
const logSnapshot = () => ({ ...timerState.value, ...Schedule.snapshot.value })

// Initialize sound scheduler for period-based sounds
const soundScheduler = new SoundScheduler(5000, AVAILABLE_SOUNDS)

// Timer worker for accurate timing even when tab is backgrounded
let timerWorker: Worker | null = null

// Initialize worker
const initWorker = (): Worker => {
    if (!timerWorker) {
        // Bundled through Vite so the worker gets a content hash — a copy in
        // public/ kept its filename across builds and went stale in the cache.
        timerWorker = new Worker(new URL('./timer-worker.ts', import.meta.url), {
            type: 'module',
        })
        timerWorker.onmessage = () => {
            // Worker sends timestamp, trigger our tick function
            tick()
        }
    }
    return timerWorker
}

// Build Period objects from a config's text definition (active config drives
// reset and the modified-from-config comparison).
const buildPeriods = (text: string): PeriodData[] =>
    parseConfigText(text).map(({ type, durationMs, note }) =>
        Period.create({ type, note, durationMs }),
    )

export const activeConfigPeriods: ReadonlySignal<PeriodData[]> = computed(() =>
    buildPeriods(activeConfig.value.text),
)

// computed signals
export const timerHasFinished: ReadonlySignal<boolean> = computed(() => Schedule.isCompleted.value)
export const currentPeriod: ReadonlySignal<PeriodData | undefined> = computed(() => {
    const index = Schedule.currentPeriodIndex.value
    // periods[null] is `undefined` at runtime too (no "null" property) —
    // spelled out so the array index type-checks.
    return index === null ? undefined : timerState.value.periods[index]
})
// computed signals for timer.jsx
export const timerOnLastPeriod: ReadonlySignal<boolean> = computed(
    // Number(null) === 0, matching the original `null + 1` coercion when idle.
    () => Number(Schedule.currentPeriodIndex.value) + 1 >= timerState.value.periods.length,
)
export const timerDuration: ReadonlySignal<number> = computed(() =>
    timerState.value.periods.reduce((sum, period) => sum + period.state.duration, 0),
)
export const timerDurationElapsed: ReadonlySignal<number> = computed(() =>
    timerState.value.periods.reduce((sum, period) => sum + period.state.elapsed, 0),
)
export const timerDurationRemaining: ReadonlySignal<number> = computed(() =>
    timerState.value.periods.reduce((sum, period) => sum + period.state.remaining, 0),
)

// Wall-clock timestamp the timeline's left edge represents. Positions derived
// from it (deadline markers, the deadline tail) must be stable until a full
// minute actually passes — `now − totalElapsed` is NOT: the worker tick and
// deadlineNow are unsynchronized 1 Hz clocks, so their sub-second phase makes
// that difference wobble ±1s per render, flipping every minute-rounded value
// that sits near a boundary (the deadline tail blinked in and out each tick).
// - Anchored: the anchor, verbatim.
// - Running: timestampStarted minus the completed periods' recorded elapsed —
//   plain stored numbers, no clock involved, changes only on real state
//   changes.
// - Paused/idle: the projection legitimately slides with "now", but quantized
//   to the whole minute so it moves in full-minute steps instead of drifting.
export const sessionStartTimestamp: ReadonlySignal<number> = computed(() => {
    const anchor = Schedule.timestampAnchor.value
    if (anchor !== null) return anchor
    const currentIndex = Schedule.currentPeriodIndex.value
    const started = Schedule.timestampStarted.value
    if (currentIndex !== null && started !== null && Schedule.timestampPaused.value === null) {
        const priorElapsed = timerState.value.periods
            .slice(0, currentIndex)
            .reduce((sum, period) => sum + period.state.elapsed, 0)
        return started - priorElapsed
    }
    return Math.floor(deadlineNow.value / 60000) * 60000 - timerDurationElapsed.value
})
// The elapsed value an `adjustElapsed` delta must be measured against — whatever
// that adjustment actually moves, floored to a whole minute.
// - Unanchored: shifting timestampStarted moves the session total 1:1, so the
//   total is the reference.
// - Anchored: the total is nailed to the wall clock and CANNOT change; only the
//   current period's elapsed moves (time is transferred with the previous
//   period). Measuring against the total there gives a delta that never
//   converges — the reference is unaffected by the adjustment, so every press
//   repeats the same sub-minute step and bleeds fractional time out of the
//   previous period's record.
// Both are floored because a RUNNING reference is never on a whole minute:
// getNextMultipleOf3Delta snaps such a value to the boundary just below it, so
// on a live clock the arrows would only ever shave off the seconds the next tick
// re-adds, and the elapsed could never actually step. Flooring makes every step
// a whole number of minutes and leaves the sub-minute remainder untouched.
export const adjustableElapsed: ReadonlySignal<number> = computed(() => {
    const reference = Schedule.isAnchored.value
        ? (currentPeriod.value?.state.elapsed ?? 0)
        : timerDurationElapsed.value
    return Math.floor(reference / (60 * 1000)) * 60 * 1000
})

export const shouldGoToNextPeriod: ReadonlySignal<boolean | undefined> = computed(
    () =>
        currentPeriod.value
        && currentPeriod.value.state.duration !== currentPeriod.value.config.userIntendedDuration,
)

// check if periods have been modified from the active config
const periodsModifiedFromConfig: ReadonlySignal<boolean> = computed(() => {
    const currentPeriods = timerState.value.periods
    const configPeriods = activeConfigPeriods.value

    if (currentPeriods.length !== configPeriods.length) return true

    return currentPeriods.some((period, index) => {
        const configPeriod = configPeriods[index]
        return (
            period.config.type !== configPeriod.config.type
            || period.config.note !== configPeriod.config.note
            || period.state.duration !== configPeriod.state.duration
        )
    })
})

// ============================================================================
// Validation Signals and Functions - Single Source of Truth for UI/Keyboard
// ============================================================================

// Computed signals for simple boolean checks (no parameters)
export const canStartPause: ReadonlySignal<boolean> = computed(
    () => !timerHasFinished.value && timerDurationRemaining.value > 0,
)

export const canReset: ReadonlySignal<boolean> = computed(
    () =>
        !(
            (!periodsModifiedFromConfig.value
                && !Schedule.timestampStarted.value
                && timerDurationRemaining.value !== 0)
            || (Schedule.currentPeriodIndex.value === null
                && !timerHasFinished.value
                && !periodsModifiedFromConfig.value)
        ),
)

export const canMoveToNextPeriod: ReadonlySignal<boolean> = computed(
    () =>
        !timerHasFinished.value
        && Schedule.currentPeriodIndex.value !== null
        && !timerOnLastPeriod.value,
)

export const canMoveToPreviousPeriod: ReadonlySignal<boolean> = computed(
    () =>
        !timerHasFinished.value
        && Schedule.currentPeriodIndex.value !== null
        && Schedule.currentPeriodIndex.value > 0,
)

export const canFinishTimer: ReadonlySignal<boolean> = computed(
    () =>
        !timerHasFinished.value
        && Schedule.currentPeriodIndex.value !== null
        && timerDurationElapsed.value >= 1 * 60 * 1000,
)

// Editing the durations config is only allowed before any meaningful time has
// elapsed — i.e. while the Finish button is disabled.
export const canConfigureDurations: ReadonlySignal<boolean> = computed(() => !canFinishTimer.value)

export const canAdjustElapsedForward: ReadonlySignal<boolean> = computed(() => {
    if (Schedule.currentPeriodIndex.value === null) return false
    if (Schedule.isAnchored.value) {
        const currentIndex = Schedule.currentPeriodIndex.value
        if (currentIndex === 0) return false
        const prev = timerState.value.periods[currentIndex - 1]
        return prev.state.elapsed > MIN_PERIOD_MS
    }
    return true
})

export const canAdjustElapsedBackward: ReadonlySignal<boolean> = computed(() => {
    if (Schedule.currentPeriodIndex.value === null) return false
    if (Schedule.isAnchored.value) {
        const currentIndex = Schedule.currentPeriodIndex.value
        if (currentIndex === 0) return false
        // currentPeriodIndex !== null (checked above) implies a period exists
        // at that index.
        return (currentPeriod.value as PeriodData).state.elapsed > 0
    }
    return timerDurationElapsed.value > 0
})

export const canAdjustDurationForward: ReadonlySignal<boolean> = computed(
    () => !timerHasFinished.value && Schedule.currentPeriodIndex.value !== null,
)

export const canChangeType: ReadonlySignal<boolean> = computed(
    () => Schedule.currentPeriodIndex.value !== null,
)

export const canAddPeriod: ReadonlySignal<boolean> = computed(
    () => Schedule.currentPeriodIndex.value !== null,
)

export const canRemovePeriod: ReadonlySignal<boolean> = computed(
    () => Schedule.currentPeriodIndex.value !== null && timerState.value.periods.length > 1,
)

export const canMoveElapsedToPrevious: ReadonlySignal<boolean> = computed(
    () =>
        Schedule.currentPeriodIndex.value !== null
        && timerDurationElapsed.value > 0
        && Schedule.currentPeriodIndex.value > 0,
)

// Validation functions for parameterized checks
export const canAdjustElapsed = (amount: number): boolean => {
    if (Schedule.currentPeriodIndex.value === null) return false
    if (Schedule.isAnchored.value) {
        return amount < 0 ? canAdjustElapsedBackward.value : canAdjustElapsedForward.value
    }
    if (amount < 0 && timerDurationElapsed.value === 0) return false
    return true
}

export const canAdjustDuration = (amount: number): boolean => {
    if (timerHasFinished.value || Schedule.currentPeriodIndex.value === null) {
        return false
    }
    // currentPeriodIndex !== null (checked above) implies a period exists.
    const current = currentPeriod.value as PeriodData
    if (amount < 0) {
        if (!timerState.value.periods.some(p => p.state.remaining > 0)) {
            return false
        }
        if (current.state.remaining < Math.abs(amount)) {
            return false
        }
        return current.state.duration - Math.abs(amount) >= MIN_PERIOD_MS
    }
    return true
}

// ============================================================================

// prepares timer for use, continuing an running timer or prepare a new one
export const initializeTimer = (): void => {
    console.clear()
    log('initializeTimer', logSnapshot(), 2)

    // nothing more to do if timer has finished or is paused
    if (timerHasFinished.value || Schedule.isPaused.value) return

    if (Schedule.isRunning.value) {
        // continue (restart) the timer if it was running
        updateCurrentPeriod()
        startTick()
    } else {
        // prepare a new timer (reset runtime state but preserve period customizations)
        initializeTimerState()
    }
}

// initialize timer state preserving period customizations but resetting runtime state
const initializeTimerState = (): void => {
    stopTick()

    // Reset only runtime properties, preserve existing periods
    Schedule.reset()

    console.clear()
    log('timer initialized (periods preserved)', logSnapshot(), 7)
}

// starts repeating the tick function using worker to update UI periodically
const startTick = (): void => {
    const worker = initWorker()
    worker.postMessage('start')
}

// stops repeating the tick function
const stopTick = (): void => {
    if (timerWorker) {
        timerWorker.postMessage('stop')
    }
}

// starts the timer
export const startTimer = (): void => {
    if (timerHasFinished.value) return // do nothing if timer has finished (needs reset)

    playSound('button')

    // hide the durations-config panel once the timer is underway
    configPanelOpen.value = false

    // A future anchor means the user pressed Start before the scheduled time —
    // "start now" re-anchors to the present instead of waiting.
    if (Schedule.isAnchored.value && (Schedule.timestampAnchor.value as number) > Date.now()) {
        Schedule.pin(Date.now())
    }

    Schedule.start()

    updateCurrentPeriod()

    startTick()

    log('started timer', logSnapshot(), 3)
}

// resumes the timer after it was paused
export const resumeTimer = (): void => {
    if (timerHasFinished.value) return // do nothing if timer has finished (needs reset)

    playSound('button')

    Schedule.resume()

    // A paused session can still be anchored (an @h:mm line typed in the live
    // editor while paused). Anchored elapsed is clock-owned: snap it to the
    // wall clock first — the current period absorbs the time that passed while
    // paused, auto-extending if it overran (updateCurrentPeriod).
    if (Schedule.isAnchored.value) reconcileToAnchor()
    updateCurrentPeriod()

    startTick()

    log('resumed timer', logSnapshot(), 13)
}

// pauses the timer (user-facing — breaks the anchor, if any)
export const pauseTimer = (): void => {
    if (timerHasFinished.value) return // do nothing if timer has finished (needs reset)

    playSound('button')

    Schedule.pause()
    Schedule.unpin()

    stopTick()

    updateCurrentPeriod()

    log('timer paused', logSnapshot(), 8)
}

// Pause/resume WITHOUT unpinning — for internal edit sessions (the "current
// durations" live editor). While anchored, resumeAfterEditing reconciles the
// schedule to the anchor so elapsed reflects the wall clock — the current
// period absorbs the time the editor was open, auto-extending if it overran;
// the anchor keeps "ticking" through the edit pause. When not anchored these
// are plain pause/resume — behavior stays byte-identical to before this feature.
export const pauseForEditing = (): void => {
    Schedule.pause()
    stopTick()
}

export const resumeAfterEditing = (): void => {
    Schedule.resume()
    if (Schedule.isAnchored.value) reconcileToAnchor()
    updateCurrentPeriod()
    startTick()
}

// ============================================================================
// Anchored start — pin the session to a wall-clock timestamp.
// ============================================================================

export const canTogglePin: ReadonlySignal<boolean> = computed(
    () => !Schedule.isCompleted.value && !Schedule.isPaused.value,
)

// Pins the timer to a wall-clock timestamp.
// - completed or paused: no-op.
// - running: freezes the CURRENT derived start (anchorMs param ignored — v1
//   only supports pinning to "now, minus however much has already elapsed").
// - idle: pins to anchorMs (defaults to now).
export const pinTimer = (anchorMs: number | null = null): void => {
    if (Schedule.isCompleted.value || Schedule.isPaused.value) return

    if (Schedule.isRunning.value) {
        updateCurrentPeriod()
        const totalElapsed = timerDurationElapsed.value
        const reference = Schedule.timestampPaused.value ?? Date.now()
        Schedule.pin(reference - totalElapsed)
        return
    }

    // idle
    Schedule.pin(anchorMs ?? Date.now())
}

export const unpinTimer = (): void => {
    Schedule.unpin()
}

export const togglePinTimer = (): void => {
    playSound('button')
    if (Schedule.isAnchored.value) unpinTimer()
    else pinTimer()
}

// Realigns timestampStarted so the current period's elapsed matches what the
// anchor dictates: timestampAnchor + Σ elapsed of all periods except current.
// No-op when not anchored, or when there's no current period.
export const reconcileToAnchor = (): void => {
    if (!Schedule.isAnchored.value || Schedule.currentPeriodIndex.value === null) return

    const currentIndex = Schedule.currentPeriodIndex.value
    const elapsedExceptCurrent = timerState.value.periods.reduce(
        (sum, period, i) => (i === currentIndex ? sum : sum + period.state.elapsed),
        0,
    )
    // isAnchored (checked above) implies timestampAnchor is set; currentPeriodIndex
    // !== null (checked above) implies the session is running/paused, which sets
    // timestampStarted.
    const desiredTS = (Schedule.timestampAnchor.value as number) + elapsedExceptCurrent
    Schedule.shiftStartedAt(desiredTS - (Schedule.timestampStarted.value as number))
}

// Replace the timeline's periods with a fresh build and reset the schedule.
// setPeriodsFromConfig always resets Schedule (clearing any prior anchor); if
// the active config's text has an `@h:mm` header, re-arm the anchor for the
// fresh timeline (a future anchor arms auto-start, a past one just sits until
// Start is pressed). Never runs at boot — only from explicit apply/reset calls.
const setPeriodsFromConfig = (periods: PeriodData[], { clearDeadlines = false } = {}): void => {
    stopTick()
    batch(() => {
        Schedule.reset()
        timerState.value = { ...timerState.value, periods }

        const anchorMinutes = parseConfigAnchor(activeConfig.value.text)
        if (anchorMinutes != null) Schedule.pin(todayAtMinutes(anchorMinutes))

        // '+' lines in the config set the deadlines on apply. Absence is what
        // differs: a plain apply leaves them alone (clearOnAbsence false), so
        // switching configs never wipes a daily deadline set in the live
        // editor — but Reset owns the list like the live editor does, so
        // nothing survives it: afterwards the deadlines are exactly what the
        // active config declares, and none if it declares none.
        applyDeadlinesFromText(activeConfig.value.text, { clearOnAbsence: clearDeadlines })
    })
}

// Rebuild the timeline from the currently active config without logging/clearing
// (used for live edits while the config panel is open).
export const applyActiveConfig = (): void => {
    setPeriodsFromConfig(activeConfigPeriods.value)
}

// Select a config and apply it to the timeline.
export const selectAndApplyConfig = (id: string): void => {
    selectConfig(id)
    applyActiveConfig()
}

// resets timer to the active config — deadlines included: they do not survive
// a reset, only the active config's own '+' lines come back.
export const resetTimer = (): void => {
    setPeriodsFromConfig(activeConfigPeriods.value, { clearDeadlines: true })

    console.clear()
    log('timer reset', logSnapshot(), 7)
}

// ============================================================================
// "Edit current durations" — live-edit the running timeline as text.
// The timer is paused while editing so elapsed values stay still, then resumed
// (only if it had been running) when editing ends.
// ============================================================================

export const editingCurrentDurations: Signal<boolean> = signal(false)
// Source of truth for the live-editor textarea. Held here (not in the component)
// so external mutations can write back into it via the effect below.
export const currentDurationsText: Signal<string> = signal('')
let wasRunningBeforeEdit = false
// True only while applyCurrentDurations is writing — lets the write-back effect
// skip editor-originated changes so typing isn't reformatted under the cursor.
let editorIsApplying = false

// Anchor fields for serializeCurrentDurations: minutes since midnight plus the
// day qualifier ('' when the anchor is from today) — anchors from before today
// serialize with their day (e.g. "@yesterday 23:50") so re-parsing the
// mirrored text resolves to the exact same day.
const anchorForSerialization = (): { anchorMinutes: number | null; anchorDayMarker: string } =>
    Schedule.isAnchored.value
        ? {
              // isAnchored implies timestampAnchor is set.
              anchorMinutes: msToMinutesSinceMidnight(Schedule.timestampAnchor.value as number),
              anchorDayMarker: formatDayMarker(Schedule.timestampAnchor.value as number),
          }
        : { anchorMinutes: null, anchorDayMarker: '' }

const beginEditCurrentDurations = (): void => {
    wasRunningBeforeEdit = Schedule.isRunning.value
    if (Schedule.isRunning.value) {
        pauseForEditing()
    }
    // Freeze the current period's elapsed into state so serialization is exact.
    updateCurrentPeriod()
    currentDurationsText.value = serializeCurrentDurations(timerState.value.periods, {
        ...anchorForSerialization(),
        deadlineLines: serializeDeadlineLines(),
    })
    editingCurrentDurations.value = true
}

const endEditCurrentDurations = (): void => {
    editingCurrentDurations.value = false
    if (wasRunningBeforeEdit && Schedule.isPaused.value) {
        resumeAfterEditing()
    }
    wasRunningBeforeEdit = false
}

// Apply edited "current durations" text to the live timeline. Past/future
// periods take their elapsed straight from state; the current period's elapsed
// is reconciled by shifting the schedule's start timestamp.
export const applyCurrentDurations = (text: string): void => {
    const parsed = parseCurrentDurationsText(text)
    if (!parsed.length) return // ignore empty / all-invalid input

    const periods: PeriodData[] = parsed.map(({ type, elapsedMs, durationMs, note }) => {
        const elapsed = Math.max(0, elapsedMs)
        const userIntendedDuration = Math.max(MIN_PERIOD_MS, durationMs)
        const duration = Math.max(userIntendedDuration, elapsed)
        return {
            config: { type, note, userIntendedDuration },
            state: { duration, elapsed, remaining: Math.max(0, duration - elapsed) },
        }
    })

    const clampedIndex = Math.min(Schedule.currentPeriodIndex.value ?? 0, periods.length - 1)

    // Resolve the typed anchor against the wall clock (see resolveTypedAnchor
    // for the day-resolution rules). A typed anchor is INVALID — leaving the
    // anchor state unchanged, never silently rewriting the record — when it
    // lies in the future (a plain @h:mm never crosses midnight implicitly;
    // type @yesterday for that) or when it is newer than the past periods'
    // typed elapsed allows (the current period's derived elapsed would go
    // negative, contradicting the record). An anchor older than the whole
    // typed timeline IS honored: on editor close the current period absorbs
    // the overrun (auto-extending), so no time is lost. When
    // the typed anchor resolves to the same minute the current anchor already
    // lies in, the anchor keeps its exact timestamp (including seconds) —
    // editing other lines never nudges the recorded start. Unpinning requires
    // fully deleting the anchor line: a half-edited '@' line keeps the anchor
    // (see hasAnchorLine).
    const anchor = parseDurationsAnchor(text)
    const reference = Schedule.timestampPaused.value ?? Date.now()
    const typedAnchorMs = anchor != null ? resolveTypedAnchor(anchor, reference) : null
    const elapsedExceptCurrent = periods.reduce(
        (sum, period, i) => (i === clampedIndex ? sum : sum + period.state.elapsed),
        0,
    )
    const anchorIsValid = typedAnchorMs != null && typedAnchorMs <= reference - elapsedExceptCurrent
    const keepExistingAnchor =
        anchorIsValid
        && Schedule.isAnchored.value
        // anchorIsValid implies typedAnchorMs is non-null; Schedule.isAnchored
        // implies timestampAnchor is set.
        && Math.floor((Schedule.timestampAnchor.value as number) / 60000)
            === Math.floor((typedAnchorMs as number) / 60000)

    editorIsApplying = true
    batch(() => {
        timerState.value = { ...timerState.value, periods }
        Schedule.setIndex(clampedIndex)

        // The live editor owns the deadlines: valid '+' lines set them, fully
        // absent ones clear them, half-edited ones keep them. Day resolution
        // uses the real clock, NOT `reference` — timestampPaused can be days
        // old (paused overnight), and "+today" must mean today.
        applyDeadlinesFromText(text, { clearOnAbsence: true })

        if (anchorIsValid && !keepExistingAnchor) {
            // anchorIsValid implies typedAnchorMs is non-null.
            Schedule.pin(typedAnchorMs as number)
        } else if (!hasAnchorLine(text) && Schedule.isAnchored.value) {
            unpinTimer()
        }

        if (Schedule.isAnchored.value) {
            // Anchored: the typed elapsed of the CURRENT period is ignored —
            // it's derived from the anchor instead.
            reconcileToAnchor()
        } else {
            // Reconcile the current period: timestampStarted = reference - desiredElapsed
            const oldStart = Schedule.timestampStarted.value
            if (oldStart !== null) {
                const desiredElapsed = periods[clampedIndex].state.elapsed
                Schedule.shiftStartedAt(reference - desiredElapsed - oldStart)
            }
        }
    })
    editorIsApplying = false
}

// While the live editor is open, mirror external edits (period-control buttons,
// keyboard shortcuts) back into the textarea. Editor-originated applies are
// skipped so the user's raw typing is never reformatted under the cursor.
effect(() => {
    const periods = timerState.value.periods
    const anchor = anchorForSerialization()
    const deadlineLines = serializeDeadlineLines()
    if (!editingCurrentDurations.value || editorIsApplying) return
    currentDurationsText.value = serializeCurrentDurations(periods, { ...anchor, deadlineLines })
})

// ----------------------------------------------------------------------------
// Durations panel open/close orchestration (shared by both modes). In the
// "current durations" mode opening pauses the timer and closing resumes it.
// ----------------------------------------------------------------------------

export const openDurationsPanel = (): void => {
    if (!canConfigureDurations.value) beginEditCurrentDurations()
    configPanelOpen.value = true
}

export const closeDurationsPanel = (): void => {
    if (editingCurrentDurations.value) endEditCurrentDurations()
    configPanelOpen.value = false
}

export const toggleDurationsPanel = (): void => {
    if (configPanelOpen.value) closeDurationsPanel()
    else openDurationsPanel()
}

// adjusts the duration of period (user-driven manual edit)
export const adjustDuration = (durationDelta: number): void => {
    // nothing to do if timer has finished or there is no current period
    if (timerHasFinished.value || Schedule.currentPeriodIndex.value === null) return

    // Ensure elapsed is fresh so the elapsed-floor in extendDuration uses the right value
    updateCurrentPeriod()

    applyToPeriod(Schedule.currentPeriodIndex.value, p => Period.extendDuration(p, durationDelta))

    // Notify sound scheduler of duration change
    soundScheduler.onDurationChange()

    log('duration adjusted', logSnapshot(), 9)
}

// Adjusts elapsed time.
// `keepDuration` picks which end of the current period is pinned while anchored:
//   false (default, the elapsed arrows/buttons) — keep its END, so its duration
//     follows the moved boundary and every later clock time stays put.
//   true ("move time to previous") — keep its LENGTH, so it simply starts, and
//     therefore ends, later. This is what the same button does unanchored.
// Ignored when not anchored: there the current period's duration is never
// touched, only timestampStarted moves.
export const adjustElapsed = (
    elapsedDelta: number,
    { keepDuration = false }: { keepDuration?: boolean } = {},
): void => {
    // nothing to do if timer has finished or there is no current period
    if (Schedule.currentPeriodIndex.value === null) return

    updateCurrentPeriod()

    if (Schedule.isAnchored.value) {
        const currentIndex = Schedule.currentPeriodIndex.value
        if (currentIndex === 0) return

        const prev = timerState.value.periods[currentIndex - 1]
        // currentPeriodIndex !== null (checked above) implies a period exists.
        const current = currentPeriod.value as PeriodData
        const clamped =
            elapsedDelta > 0
                ? Math.min(elapsedDelta, prev.state.elapsed - MIN_PERIOD_MS)
                : Math.max(elapsedDelta, -current.state.elapsed)

        if (clamped === 0 || (elapsedDelta > 0 && clamped < 0)) return

        const oldElapsed = current.state.elapsed

        batch(() => {
            applyToPeriod(currentIndex - 1, p =>
                Period.amendRecordedDuration(p, p.state.elapsed - clamped),
            )
            // The transfer slides the boundary between the two periods, not the
            // current period's END: its duration follows its derived elapsed by
            // the same amount, so `remaining` — and every clock time from here
            // to the end of the session — is unchanged. Shifted BEFORE the
            // elapsed refresh below so the grown duration is already in place
            // and a forward transfer never reads as an overrun.
            if (!keepDuration) applyToPeriod(currentIndex, p => Period.shiftDuration(p, clamped))
            reconcileToAnchor()
        })
        // `relax` only matters on the keepDuration path: there the duration is
        // left alone while elapsed shrinks, so an auto-extension could outlive
        // the elapsed that earned it. Otherwise duration is managed explicitly
        // above, in both directions.
        updateCurrentPeriod({ relax: keepDuration && clamped < 0 })

        // currentPeriodIndex !== null (checked above) implies a period exists.
        const newElapsed = (currentPeriod.value as PeriodData).state.elapsed
        soundScheduler.onElapsedAdjustment(newElapsed, oldElapsed)

        log('time adjusted (anchored transfer)', logSnapshot(), 6)
        return
    }

    // currentPeriodIndex !== null (checked above) implies a period exists.
    Schedule.shiftStartedAt(
        Math.min(
            // prevents elapsed to go negative
            (currentPeriod.value as PeriodData).state.elapsed,
            -elapsedDelta,
        ),
    )

    updateCurrentPeriod({ relax: elapsedDelta < 0 })

    // Notify sound scheduler of elapsed time change
    const newElapsed = (currentPeriod.value as PeriodData).state.elapsed
    const oldElapsed = newElapsed - elapsedDelta
    soundScheduler.onElapsedAdjustment(newElapsed, oldElapsed)

    log('time adjusted', logSnapshot(), 6)
}

// update (recalculate) period related values

// calculate elapsed and remaining time for the current period
const calculatePeriodTimes = (
    timestampStarted: number,
    timestampPaused: number | null,
    periodDuration: number,
): { periodDurationElapsed: number; periodDurationRemaining: number } => {
    const timeToCalculateWith = timestampPaused || Date.now()
    const periodDurationElapsed = Math.max(0, timeToCalculateWith - timestampStarted)
    const periodDurationRemaining = Math.max(0, periodDuration - periodDurationElapsed)

    return {
        periodDurationElapsed,
        periodDurationRemaining,
    }
}

// check if the period has elapsed
const hasPeriodReachedCompletion = (
    periodDurationElapsed: number,
    periodDuration: number,
): boolean => periodDurationElapsed > 0 && periodDurationElapsed >= periodDuration

// handle actions when a period is completed
const handlePeriodElapsed = (): void => {
    // auto-extend state.duration only; config.userIntendedDuration is intentionally preserved
    // Called only from updateCurrentPeriod after currentPeriod.value was confirmed
    // truthy, which implies currentPeriodIndex is non-null.
    applyToPeriod(Schedule.currentPeriodIndex.value as number, p =>
        Period.autoExtendDuration(p, DURATION_TO_ADD_AUTOMATICALLY),
    )

    log('period automatically extended', logSnapshot(), 2)
}

// main update period function.
// `relax` is for callers that may have SHRUNK elapsed (moving elapsed time back
// to the previous period): auto-extension earned while overrunning would
// otherwise outlive the elapsed that justified it, permanently inflating the
// period's duration and pushing every projected clock time out. Off by default
// so the 1 Hz tick keeps auto-extension's whole-minute grace.
const updateCurrentPeriod = ({ relax = false }: { relax?: boolean } = {}): void => {
    // guard clause for no current period
    if (!currentPeriod.value) return

    // currentPeriod.value truthy implies the session is running/paused, which
    // sets timestampStarted and currentPeriodIndex.
    const timestampStarted = Schedule.timestampStarted.value as number
    const currentIndex = Schedule.currentPeriodIndex.value as number

    // calculate period times
    const { periodDurationElapsed } = calculatePeriodTimes(
        timestampStarted,
        Schedule.timestampPaused.value,
        currentPeriod.value.state.duration,
    )

    // Write fresh elapsed/remaining first so handlePeriodElapsed sees the
    // real elapsed when it auto-extends (otherwise duration cannot clamp
    // to elapsed and the elapsed bar can overflow the period block).
    applyToPeriod(currentIndex, p => Period.applyElapsed(p, periodDurationElapsed))

    // Fresh elapsed is in the signal, so relaxing reads the value it must
    // respect — and running before the completion check below lets a still
    // overrunning period re-extend in the same pass.
    if (relax) applyToPeriod(currentIndex, p => Period.relaxAutoExtension(p))

    // Anchored or not, an overrun period auto-extends and later periods just
    // shift — the anchor only fixes the session start and the completed
    // periods' record, so an anchored session never self-finishes and any
    // clock gap (late start, sleep/reload, editor open) lands on the current
    // period.
    if (
        hasPeriodReachedCompletion(
            periodDurationElapsed,
            // Re-read: applyElapsed / relaxAutoExtension above may have changed duration.
            (currentPeriod.value as PeriodData).state.duration,
        )
    )
        handlePeriodElapsed()
}

// jump to the next period
export const moveToNextPeriod = (): void => {
    if (Schedule.currentPeriodIndex.value === null) return

    // Ensure elapsed is fresh before Period.complete reads it (a tick may not
    // have fired since the user clicked the button).
    updateCurrentPeriod()

    const nextPeriodIndex = Schedule.currentPeriodIndex.value + 1
    const nextPeriod = timerState.value.periods[nextPeriodIndex]

    // currentPeriodIndex !== null (checked above) implies a period exists.
    const { period: completed, remainder } = Period.complete(currentPeriod.value as PeriodData)

    batch(() => {
        applyToPeriod(Schedule.currentPeriodIndex.value as number, () => completed)

        Schedule.advance({ remainderMs: remainder, nextPeriodElapsedMs: nextPeriod.state.elapsed })
    })

    // Notify sound scheduler of period change
    soundScheduler.onPeriodChange()

    log('finished current period', logSnapshot(), 10)
}

// jump to the previous period
export const moveToPreviousPeriod = (): void => {
    if (Schedule.currentPeriodIndex.value === null || Schedule.currentPeriodIndex.value === 0)
        return

    const previousPeriodIndex = Schedule.currentPeriodIndex.value - 1
    const previousPeriod = timerState.value.periods[previousPeriodIndex]

    // add duration to the previous period's duration so it doesn't finish right away

    batch(() => {
        applyToPeriod(previousPeriodIndex, p => ({
            ...p,
            state: { ...p.state, duration: p.state.duration + DURATION_TO_ADD_AUTOMATICALLY },
        }))

        Schedule.rewind({
            extensionMs: DURATION_TO_ADD_AUTOMATICALLY,
            prevElapsedMs: previousPeriod.state.elapsed,
            // currentPeriodIndex !== null (checked above) implies a period exists.
            currentElapsedMs: (currentPeriod.value as PeriodData).state.elapsed,
        })
    })

    updateCurrentPeriod()

    log('jumped to previous period and added some time to the duration', logSnapshot(), 13)
}

// add time elapsed in the current period to previous and remove it from current
export const moveElapsedTimeToPreviousPeriod = (): void => {
    log('move time back', logSnapshot(), 2)
    // Only ever invoked when canMoveElapsedToPrevious is true, i.e. a current
    // period at index > 0 exists.
    const elapsed = (currentPeriod.value as PeriodData).state.elapsed

    // While anchored, adjustElapsed's anchored branch already absorbs the
    // transferred time into the previous period (via amendRecordedDuration) —
    // absorbing it here too would double-count it.
    if (!Schedule.isAnchored.value) {
        const previousPeriodIndex = (Schedule.currentPeriodIndex.value as number) - 1
        applyToPeriod(previousPeriodIndex, p => Period.absorbAsCompleted(p, elapsed))
    }

    // keepDuration: the current period hands its time over and then runs its
    // full planned length from the later start — it ends later. Same shape as
    // the unanchored path above, where its duration is never touched either.
    adjustElapsed(-elapsed, { keepDuration: true })

    // Notify sound scheduler of period change
    soundScheduler.onPeriodChange()
}

// change work type
export const changeType = (): void => {
    const types = timerState.value.types
    // Only ever invoked when canChangeType is true, i.e. a current period exists.
    const current = currentPeriod.value as PeriodData
    const currentType = current.config.type
    const currentIndex = types.indexOf(currentType) // Find the index of the current type
    const nextIndex = (currentIndex + 1) % types.length // Calculate the next index (with wrap-around)

    applyToPeriod(Schedule.currentPeriodIndex.value as number, p =>
        Period.setType(p, types[nextIndex]),
    )
    log('changed current type', logSnapshot(), 8)
}

// set current period to a specific type
export const setCurrentPeriodType = (type: PeriodType): void => {
    const types = timerState.value.types
    if (!types.includes(type)) {
        log(`Invalid type: ${type}. Valid types are: ${types.join(', ')}`, 2)
        return
    }

    applyToPeriod(Schedule.currentPeriodIndex.value as number, p => Period.setType(p, type))
    log(`set current period type to ${type}`, logSnapshot(), 8)
}

// Private helper: write a Periods.X result tuple atomically into timerState + Schedule.
const writePeriodsState = ({
    periods,
    currentIndex,
}: {
    periods: PeriodData[]
    currentIndex: number | null
}): void => {
    batch(() => {
        timerState.value = { ...timerState.value, periods }
        Schedule.setIndex(currentIndex)
    })
}

const DEFAULT_NEW_PERIOD_MS = 24 * 60 * 1000

// The wall-clock moment the session's bar currently ends at: derived start
// (anchor, or now minus elapsed) plus the periods' total duration.
const projectedSessionEnd = (): number => {
    const now = Date.now()
    return (
        (Schedule.timestampAnchor.peek() ?? now - timerDurationElapsed.peek())
        + timerDuration.peek()
    )
}

// Duration for a period added at the session's tail: when the nearest deadline
// beyond the projected session end is further out than the default would
// reach, the new period fills the whole gap so the session ends exactly at
// that deadline; otherwise the default. `coveredUntil` is the wall-clock
// moment the rest of the schedule already covers — the new period spans from
// there to the deadline.
const fillToDeadlineDuration = ({ coveredUntil }: { coveredUntil: number }): number => {
    const next = nearestDeadlineAfter(projectedSessionEnd())
    if (next === null) return DEFAULT_NEW_PERIOD_MS
    return Math.max(DEFAULT_NEW_PERIOD_MS, next - coveredUntil)
}

// add a new period after the current one
export const addPeriod = (): void => {
    if (Schedule.currentPeriodIndex.value === null) return

    // Ensure elapsed is fresh — the fill below reads it (branch choice and
    // sub-minute remainder) before moveToNextPeriod refreshes it again.
    updateCurrentPeriod()

    const currentIndex = Schedule.currentPeriodIndex.value
    // currentPeriodIndex !== null (checked above) implies a period exists.
    const current = currentPeriod.value as PeriodData
    const hasElapsedMoreThan60Seconds = current.state.elapsed > 60 * 1000

    // On the last period the added period ends the session, so it fills up to
    // the nearest deadline beyond the current end when that beats the default.
    // Covered wall clock differs per branch: moving into the new period,
    // Schedule.advance starts it at now minus the completed period's
    // sub-minute remainder; inserting before, the displaced period still runs
    // after the new one, so its fresh duration counts as already covered.
    const onLastPeriod = currentIndex === timerState.value.periods.length - 1
    const durationMs = onLastPeriod
        ? fillToDeadlineDuration({
              coveredUntil: hasElapsedMoreThan60Seconds
                  ? Date.now() - (current.state.elapsed % (60 * 1000))
                  : Date.now() + current.config.userIntendedDuration,
          })
        : DEFAULT_NEW_PERIOD_MS

    const newPeriod = Period.create({ type: 'fun', note: '', durationMs })

    if (hasElapsedMoreThan60Seconds) {
        // Insert after current period and move to it.
        // atIndex > currentIndex so Periods.insert keeps currentIndex unchanged.
        const result = Periods.insert({
            periods: timerState.value.periods,
            currentIndex,
            atIndex: currentIndex + 1,
            period: newPeriod,
        })
        writePeriodsState(result)
        moveToNextPeriod()
        log('added new period after current and moved to it', logSnapshot(), 5)
    } else {
        // Insert before current period and make it current.
        // Capture the displaced period's config before mutating the array so
        // Period.unstarted can use config.userIntendedDuration as the fresh duration.
        const displacedConfig = current.config

        const result = Periods.insertMakingCurrent({
            periods: timerState.value.periods,
            currentIndex,
            atIndex: currentIndex,
            period: newPeriod,
        })

        batch(() => {
            timerState.value = { ...timerState.value, periods: result.periods }
            Schedule.setIndex(result.currentIndex)
            // Stay at same index (now the new period) and reset start timestamp
            Schedule.restartCurrentPeriod()
        })

        // Reset the displaced period (now at currentIndex + 1) to fresh state via Period.unstarted.
        // config.userIntendedDuration is the source of truth for the fresh duration — if the
        // period was only auto-extended, userIntendedDuration still holds the original user target.
        // Manual extensions (via adjustDuration / Period.extendDuration) do update userIntendedDuration,
        // so unstarted correctly reflects any manual duration edit the user had made.
        applyToPeriod(currentIndex + 1, () => Period.unstarted(displacedConfig))

        log('added new period before current, reset current period elapsed time', logSnapshot(), 5)
    }
}

// remove the current period and move to next period (or previous if on last period)
export const removePeriod = (): void => {
    if (Schedule.currentPeriodIndex.value === null) return
    if (timerState.value.periods.length <= 1) return // Prevent removing the last period

    const indexToRemove = Schedule.currentPeriodIndex.value
    const isLastPeriod = indexToRemove === timerState.value.periods.length - 1

    // First move to the next or previous period (carries Period.complete round-down + sound)
    if (isLastPeriod) {
        moveToPreviousPeriod()
    } else {
        moveToNextPeriod()
    }

    // After navigation, remove the original period using the post-navigation currentIndex
    const result = Periods.remove({
        periods: timerState.value.periods,
        currentIndex: Schedule.currentPeriodIndex.value,
        indexToRemove,
    })

    writePeriodsState(result)

    log('removed period', logSnapshot(), 5)
}

// the whole timer completion
export const handleTimerCompletion = (): void => {
    stopTick()

    // Ensure elapsed is fresh before Period.complete reads it (a tick may not
    // have fired since the user clicked the Finish button).
    updateCurrentPeriod()

    // updates are not combined because they need to be run sequentially

    // Only ever invoked when a current period exists.
    const { period: completed } = Period.complete(currentPeriod.value as PeriodData)
    applyToPeriod(Schedule.currentPeriodIndex.value as number, () => completed)

    const filteredPeriods = timerState.value.periods.filter(
        period => period.state.elapsed >= DURATION_TO_ADD_AUTOMATICALLY,
    )

    batch(() => {
        timerState.value = { ...timerState.value, periods: filteredPeriods }
        Schedule.complete()
        Schedule.setIndex(null)
    })

    log('finished last period', logSnapshot(), 1)
    playSound('timerFinished')
}

// remove a specific period by index
export const removePeriodByIndex = (periodIndex: number): void => {
    if (timerState.value.periods.length <= 1) return // Prevent removing the last period
    if (periodIndex < 0 || periodIndex >= timerState.value.periods.length) return // Invalid index

    // If removing the current period, move to next/previous period first
    if (Schedule.currentPeriodIndex.value === periodIndex) {
        const isLastPeriod = periodIndex === timerState.value.periods.length - 1

        if (isLastPeriod) {
            // If we're on the last period, move to the previous period
            moveToPreviousPeriod()
        } else {
            // Otherwise move to next period
            moveToNextPeriod()
        }
    }

    const result = Periods.remove({
        periods: timerState.value.periods,
        currentIndex: Schedule.currentPeriodIndex.value,
        indexToRemove: periodIndex,
    })

    batch(() => {
        timerState.value = { ...timerState.value, periods: result.periods }
        Schedule.setIndex(result.currentIndex)
    })

    log('removed period by index', { periodIndex, newLength: result.periods.length }, 5)
}

// Signal to track which period should auto-open for editing
export const autoEditIndex: Signal<number | null> = signal(null)

// add a new period at a specific index
export const addPeriodAtIndex = (
    afterIndex: number,
    periodConfig?: { duration: number; type: PeriodType; note: string },
): void => {
    // Appended after the last period the new period ends the session — it
    // starts at the current end, so that is what the fill measures from.
    const appendsLast = afterIndex >= timerState.value.periods.length - 1
    const { duration, type, note } = periodConfig ?? {
        duration: appendsLast
            ? fillToDeadlineDuration({ coveredUntil: projectedSessionEnd() })
            : DEFAULT_NEW_PERIOD_MS,
        type: 'fun' as PeriodType,
        note: '',
    }

    const newPeriod = Period.create({ type, note, durationMs: duration })

    const result = Periods.insert({
        periods: timerState.value.periods,
        currentIndex: Schedule.currentPeriodIndex.value,
        atIndex: afterIndex + 1,
        period: newPeriod,
    })

    batch(() => {
        timerState.value = { ...timerState.value, periods: result.periods }
        Schedule.setIndex(result.currentIndex)
    })

    // Signal that the new period should auto-open for editing
    autoEditIndex.value = afterIndex + 1

    log('added period at index', { afterIndex, newLength: result.periods.length }, 5)
}

// Apply a Period → Period op to the period at the given index.
// Out-of-range index produces a no-op write. Index validation is the caller's responsibility.
export const applyToPeriod = (index: number, op: (period: PeriodData) => PeriodData): void => {
    timerState.value = {
        ...timerState.value,
        periods: timerState.value.periods.map((period, i) => (i === index ? op(period) : period)),
    }
}

// update function called by interval timer
const tick = (): void => {
    updateCurrentPeriod()

    // Check for period-based sounds
    if (currentPeriod.value) {
        const elapsedMs = currentPeriod.value.state.elapsed
        const intendedMs = currentPeriod.value.config.userIntendedDuration
        const periodType = currentPeriod.value.config.type
        const isPaused = Schedule.isPaused.value

        // Determine next period type for timesup sound selection
        // currentPeriod.value truthy implies currentPeriodIndex is non-null.
        const currentIndex = Schedule.currentPeriodIndex.value as number
        const nextIndex = currentIndex + 1
        const nextPeriod = timerState.value.periods[nextIndex]
        const nextPeriodType = nextPeriod ? nextPeriod.config.type : 'finish'

        const soundToPlay = soundScheduler.checkSounds(
            elapsedMs,
            intendedMs,
            periodType,
            isPaused,
            nextPeriodType,
        )

        if (soundToPlay) {
            const soundKey = getSoundKeyFromPath(soundToPlay.soundPath)
            playPeriodSound(soundKey)
        }
    }

    // Play timer finished sound if the timer has completed
    if (timerHasFinished.value) {
        playTimerFinishedSound()
    }

    // log('tick', logSnapshot(), 14)
}

// persist timer state to localStorage on every state change
effect(() => {
    saveState({ ...timerState.value, ...Schedule.snapshot.value })
})

// Auto-start when armed: idle + a future anchor pinned. Fires startTimer at
// the scheduled moment. A past anchor (e.g. an armed state persisted and
// reloaded after the moment already passed) does NOT auto-start — the user
// must press Start explicitly; the first period then absorbs the whole gap
// since the anchor (see startTimer).
let armedStartTimeoutId: ReturnType<typeof setTimeout> | null = null
effect(() => {
    const idle = Schedule.isIdle.value
    const anchor = Schedule.timestampAnchor.value

    if (armedStartTimeoutId !== null) {
        clearTimeout(armedStartTimeoutId)
        armedStartTimeoutId = null
    }

    if (idle && anchor != null && anchor > Date.now()) {
        armedStartTimeoutId = setTimeout(() => {
            armedStartTimeoutId = null
            startTimer()
        }, anchor - Date.now())
    }
})

// Export timer state globally for sounds module to access
if (typeof window !== 'undefined') {
    window.__timerModule = {
        timerState,
        currentPeriod,
        Schedule,
    }
}
