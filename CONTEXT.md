# Tymer

Multi-period countdown timer (Pomodoro-style). The user defines a sequence of work/break/fun **Periods**, runs through them, can navigate forward/backward, and edits planned or recorded durations on the fly.

## Language

### Period

**Period**:
A single time block in the timer's sequence. Has user-set configuration (type, note, intended duration) and clock-driven state (duration, elapsed, remaining).
_Avoid_: interval, slot, segment

**PeriodConfig**:
The user-controlled facet of a Period: `type`, `note`, `userIntendedDuration`. Edited via the timeline form. Drives display and sound selection.

**PeriodState**:
The clock-driven facet of a Period: `duration`, `elapsed`, `remaining`. Mutated by the Timer as it ticks; never read for display semantics, only for time math.

**Period type**:
Categorizes a Period as `work`, `break`, or `fun`. Affects sound selection and display styling. Never feeds into time math.

**Periods**:
The ordered list of Period objects owned by Timer. Mutations of this list (insertion, removal) must keep `Schedule.currentPeriodIndex` coherent — the rules live in the `Periods` Module, which exposes `insert` (preserves the conceptual Current Period), `insertMakingCurrent` (new Period takes over the Current Period's slot), and `remove` (precondition: `indexToRemove` is not the Current Period — caller pre-navigates).
_Avoid_: list, array, sequence

### Lifecycle

**Past Period**:
A Period whose index is less than `currentPeriodIndex`. The user has moved beyond it.
_Avoid_: finished, completed (those refer to the Timer)

**Current Period**:
The Period at `currentPeriodIndex`. The one accumulating elapsed time.
_Avoid_: active, running

**Future Period**:
A Period whose index is greater than `currentPeriodIndex`. Not yet reached.
_Avoid_: pending, scheduled

**Phase**:
The Timer's lifecycle stage: `idle` (never started), `running` (ticking), `paused` (started but stopped), `completed` (last Period was finalized). Owned by **Schedule**.
_Avoid_: status, mode

### Schedule

**Schedule**:
The Timer's position-and-clock state — `phase`, `currentPeriodIndex`, `timestampStarted`, `timestampPaused`. Owned by a single signal-backed module that exposes verbs (`start`, `pause`, `resume`, `advance`, `rewind`, `complete`, `reset`) and read-only computeds. Schedule does not see Periods; Timer composes Schedule with the Periods list for verbs that need both.
_Avoid_: state, status, clock

**Schedule advance**:
The Schedule transition that moves the Current Period one forward. Bumps `currentPeriodIndex` and recomputes `timestampStarted` from the unclaimed sub-minute remainder plus any pre-existing elapsed on the new Current Period. Pairs with **Period.complete** in Timer's `moveToNextPeriod`.

**Schedule rewind**:
The Schedule transition that moves the Current Period one backward. Adjusts `timestampStarted` to compensate for the elapsed swap between the old and new Current Period. Pairs with **Period.extendDuration** in Timer's `moveToPreviousPeriod`.

### Duration semantics

**Planned duration**:
Forward-looking — "how long the user wants this Period to be." Stored in `config.userIntendedDuration` and mirrored in `state.duration` until auto-extension diverges them. Edits to a Current or Future Period set the planned duration.

**Recorded duration**:
Backward-looking — "how long this Period actually was." Equal to `state.elapsed` for a Past Period. Edits to a Past Period amend the recorded duration (overwriting elapsed).

**Auto-extension**:
When `state.elapsed >= state.duration`, the Timer extends `state.duration` by a fixed delta to avoid abrupt termination. `config.userIntendedDuration` is left untouched — that's how the system remembers the user's original target.

**Overtime**:
The condition `state.elapsed > config.userIntendedDuration`. Triggers different sound selection (the `overtime`/`overtimeBreak` sound bank) and visual indicators.

### Transition mechanics

**Round-down on transition**:
When moving to the next Period, the current Period's `elapsed` is snapped down to the nearest whole-minute boundary. The unclaimed remainder is pushed into the next Period's start time so no real time is lost.

**Tick**:
A periodic update driven by a Web Worker. Recomputes the Current Period's elapsed/remaining from `Date.now() - timestampStarted` and triggers period-based sounds.

## Relationships

- A **Timer** owns an ordered list of **Periods** plus a **Schedule**
- A **Schedule** owns `phase`, `currentPeriodIndex`, `timestampStarted`, `timestampPaused`. Phase ↔ timestamp coherence (e.g. `running ⇒ timestampStarted !== null`) is a Schedule invariant
- Each **Period** has exactly one **PeriodConfig** and one **PeriodState**
- **Past / Current / Future** are derived from a Period's index vs Schedule's `currentPeriodIndex` — never stored
- **Planned duration** lives in `PeriodConfig`; **Recorded duration** lives in `PeriodState` (as `elapsed` once a Period becomes Past)
- **Auto-extension** mutates `PeriodState.duration` only; **Overtime** is the condition that may trigger it
- Mixed verbs that touch both Schedule and Periods (e.g. `moveToNextPeriod`) live in Timer and wrap their multi-signal writes in `batch()`

## Example dialogue

> **Dev:** "If the user edits a Past Period's duration in the timeline form, what should happen to the elapsed time?"
> **Owner:** "It overwrites elapsed. Editing a Past Period means amending the recorded duration — they're saying 'actually I worked 30 minutes there, not 24.' That's different from editing a Future Period, which just sets the planned duration."
>
> **Dev:** "And going *back* to a Past Period via the previous-period button?"
> **Owner:** "That's not editing — that's resuming. The Period becomes Current again, elapsed keeps growing from where it was. We pre-extend its planned duration by a few minutes so they have breathing room before auto-extension kicks in."

## Flagged ambiguities

- **"finished"** was used to mean both "this Period is past" and "the whole Timer is completed." Resolved: Periods don't have a finished flag — Past is derived from position. **Phase = completed** is the only "done" state, scoped to the Timer.
- **"active"** was used for the Current Period. Resolved: use **Current**. "Active" is reserved for UI/CSS state.
- **`periodDuration` vs `periodUserIntendedDuration`** — both stored, can diverge during auto-extension. Resolved: `state.duration` is what the timer counts against; `config.userIntendedDuration` is the user's target. They diverge on auto-extension; they realign on manual edit.
