# Tymer — Product Requirements Document

Product-logic specification of the Tymer countdown/Pomodoro timer, written from the
user's point of view. It describes **what the product does and must keep doing**,
independent of implementation (web, Preact, PWA plumbing, debugging aids, and build
tooling are deliberately out of scope). Intended as the base document for a CLI/TUI port.

Conventions used below:

- All internal time values are milliseconds; this document writes them in minutes/seconds.
- "Session" = one run of the timer through its list of periods.
- "Current period" = the period the session position points at (there is exactly one
  while a session is underway, none when idle or finished).

---

## 1. Product overview

Tymer is a multi-period countdown timer. The user lays out a sequence of **periods**
(work / break / fun blocks with planned durations), starts the session, and the timer
walks through them. Its defining traits, in order of importance:

1. **Wall-clock-derived time.** Elapsed time is always computed from timestamps
   (`now − startedAt`), never by counting ticks. Closing the app, device sleep, or a
   reload lose nothing — on return the elapsed time reflects the real clock.
2. **Nothing advances or ends by itself.** A period that reaches its planned duration
   does not move on; it **auto-extends** and keeps running until the user acts. The
   session never self-finishes (one exception: an "armed" future start auto-starts,
   §8.3).
3. **The record is editable at every level** — nudge elapsed time by keys/buttons,
   rewrite the whole timeline as text, edit any single period, move time across the
   period boundary — with strict invariants (§4.1) so the record stays coherent.
4. **Spoken time awareness.** Voice announcements at elapsed/remaining/overtime marks
   and at period transitions let the user track progress without looking (§10).
5. **Everything persists.** Session state, named configs, and preferences survive
   restarts; a running session continues seamlessly (§11).

---

## 2. Core concepts

### 2.1 Period

A period has:

| Field                  | Meaning                                                        |
| ---------------------- | -------------------------------------------------------------- |
| `type`                 | `work`, `break`, or `fun`                                      |
| `note`                 | free text label (optional)                                     |
| `userIntendedDuration` | the planned length the user asked for                          |
| `duration`             | the effective length (= planned, unless auto-extended past it) |
| `elapsed`              | time actually spent in the period                              |
| `remaining`            | always derived: `max(0, duration − elapsed)`                   |

Lifecycle (Past / Current / Future) is never stored — it is derived from the period's
position relative to the session position.

### 2.2 Session

A session is an ordered list of periods plus a **schedule**:

| Field                | Meaning                                                          |
| -------------------- | ---------------------------------------------------------------- |
| `phase`              | `idle` → `running` ⇄ `paused` → `completed`                      |
| `currentPeriodIndex` | which period is current (`null` when idle or completed)          |
| `timestampStarted`   | reference timestamp the current period's elapsed is derived from |
| `timestampPaused`    | set while paused; freezes "now" for all elapsed math             |
| `timestampAnchor`    | set when the session start is pinned to a wall-clock time (§8)   |

### 2.3 Constants

| Constant              | Value | Role                                                |
| --------------------- | ----- | --------------------------------------------------- |
| Minimum period length | 1 min | no period (planned or recorded) may ever be shorter |
| Auto-extension step   | 1 min | added each time a period overruns its duration      |
| Tick rate             | 1 Hz  | UI refresh only — never the source of elapsed time  |
| Sound trigger window  | ±2 s  | tolerance around a sound's target moment (§10.2)    |

### 2.4 Default timeline

The built-in, read-only "Default" config: 18 work periods of 24 min alternating with
17 breaks of 6 min (W24 B6 … W24), 35 periods, 8 h 54 min total.

---

## 3. Session lifecycle

### 3.1 Start

- Allowed when not finished and total remaining > 0. Disabled while the durations
  panel is open.
- Sets the position to period 0 and `timestampStarted = now` — unless an anchor is set,
  in which case `timestampStarted = anchor` (§8.2).
- If an anchor lies in the **future** when Start is pressed, the button reads
  **"Start now"** and pressing it re-pins the anchor to the present (start immediately
  instead of waiting).

### 3.2 Pause / Resume

- Pause records `timestampPaused = now`. While paused, all elapsed math uses that
  frozen timestamp as "now", so elapsed values stand still — including through
  period navigation and elapsed adjustments made while paused.
- Resume shifts `timestampStarted` forward by exactly the pause length, so the pause
  contributes zero elapsed time.
- **Pausing breaks the anchor** (a user-facing pause unpins, §8.5). Resuming a session
  that is somehow paused _and_ anchored (reachable by typing an `@` line in the live
  editor while paused) first reconciles elapsed to the wall clock — the current period
  absorbs the paused time.
- Internal "edit pauses" (live editor, per-period edit form) pause/resume without
  unpinning (§8.5).

### 3.3 Reset

- Rebuilds the timeline from the **active config** (§6) and clears the schedule,
  including any anchor. If the active config carries an `@h:mm` header the anchor is
  immediately re-armed for the fresh timeline (§8.2).
- Also rebuilds the **deadlines** from that config's `+` lines, clearing them when it
  has none — deadlines do not survive a Reset (§15.1).
- Enabled only once something diverges from the pristine state: periods modified from
  the active config, a session started, or a session finished. (A freshly loaded,
  untouched timeline has nothing to reset.)
- The button is labeled "Reset" for the built-in config, "Reset to <name>" otherwise,
  and is highlighted once the session has finished.

### 3.4 Finish

- Allowed once a current period exists **and total elapsed ≥ 1 min** (before that the
  session is considered not-meaningfully-started).
- Completes the current period (round-down rule, §4.3), then **drops every period with
  elapsed < 1 min from the record** — untouched future periods vanish; what remains is
  the historical record of the session.
- Phase becomes `completed`, position cleared. The finish sound plays once.
- A finished session shows its historical clock times (projected backward from now,
  §9.2) and can only be Reset.
- The Finish button is highlighted when the session is on the last period and that
  period has been auto-extended (the natural "you're done" moment).

### 3.5 Restart behavior on app launch

- A **running** session continues exactly where the wall clock says it is (any gap —
  reload, crash, days later — lands on the current period as elapsed time, §4.2).
- A **paused** or **finished** session stays paused/finished.
- Otherwise the schedule resets to idle, preserving any period customizations.

---

## 4. Time model

### 4.1 Invariants

1. `remaining = max(0, duration − elapsed)` at all times.
2. `duration ≥ elapsed` for the current period (enforced by auto-extension).
3. No period, planned or recorded, is ever shorter than 1 minute.
4. `duration = userIntendedDuration` unless auto-extension has pushed `duration`
   higher. Manual duration edits realign both; auto-extension is the only source of
   divergence. That divergence is user-visible (§9.1) and drives "move on" nudges.

### 4.2 Elapsed derivation and auto-extension

- Current period elapsed = `(timestampPaused ?? now) − timestampStarted`, floored at 0.
- When elapsed reaches `duration`, the period **auto-extends**: duration grows by 1 min,
  and never less than elapsed (so a huge gap — device sleep, late anchored start — is
  absorbed in one step, then the +1 min cadence resumes). Remaining therefore counts
  down to 0:00, jumps to ~1:00, and repeats until the user moves on.
- `userIntendedDuration` is _not_ touched by auto-extension — the plan is preserved,
  and the overrun (elapsed past the plan) is displayed distinctly (§9.1) and used for
  overtime announcements (§10.1).
- The "next period" button is highlighted while the current period is auto-extended
  (i.e. running over plan) — the product's nudge to move on.

### 4.3 Completing a period (moving forward)

When the user leaves a period forward (next-period, finish, or add-after-current):

- **elapsed ≥ 1 min:** the recorded elapsed rounds **down** to a whole minute; the
  sub-minute remainder is not lost — it carries into the next period, whose start is
  backdated by the remainder (it begins with those seconds already elapsed).
- **elapsed < 1 min:** the record snaps **up** to exactly 1 min (invariant 3). The
  credited time is "borrowed": the next period's start is pushed into the future by
  the credit, and its elapsed reads 0 until the wall clock repays it.
- Past periods always show whole-minute records with `remaining = 0`.

### 4.4 Moving to the previous period

- The previous period's duration is extended by 1 min flat, so it does not instantly
  re-complete on arrival.
- It resumes with its previously recorded elapsed intact.
- The period being left keeps its elapsed record; re-advancing into it later resumes
  from that record (the start is backdated by its stored elapsed).
- Allowed whenever a current period exists and it is not the first.

---

## 5. Editing the running session

### 5.1 Adjusting elapsed time (normal mode, no anchor)

Adjusting elapsed shifts the session's start reference; the current period's duration
is never touched by the adjustment itself.

- **Forward** (+1 m, +6 m, ±24 m, snap): unlimited; if it pushes the period past its
  duration, auto-extension absorbs it.
- **Backward:** clamped so the **current period's** elapsed cannot go below zero — a
  large backward request (e.g. "reset elapsed", which passes the whole session total)
  in effect zeroes the current period only.
- **Relaxation:** after any backward move, auto-extension is wound back — duration
  returns to `userIntendedDuration` (floored at the new elapsed and at 1 min). A
  forward/backward round trip is therefore lossless; extension never outlives the
  overrun that earned it.
- **Snap-to-3** (plain ←/→ keys): jumps to the next/previous multiple of 3 minutes of
  the **adjustable reference** — the session total elapsed in normal mode — which is
  first floored to a whole minute (a live reference never sits exactly on a minute;
  without the floor the keys would only shave off seconds the next tick re-adds).
  From an exact multiple of 3, down moves a full 3 minutes.
- **Jump to period end** (End key): delta = current period duration − current period
  elapsed (measured against the current period, not the session total).
- **Move time to previous** (Backspace / button): the current period's entire elapsed
  is handed to the **previous** period, which absorbs it as completed time (its
  duration and elapsed both grow; remaining stays 0). The current period restarts at
  zero elapsed with its planned length intact — it starts, and therefore ends, later.
  Requires a previous period and nonzero elapsed.

Anchored mode changes all of the above — see §8.6.

### 5.2 Adjusting duration

- Applies to the current period; updates plan and effective duration together
  (invariant 4).
- Increase: always allowed while a current period exists and the session isn't finished.
- Decrease: only if the current period's remaining ≥ the decrease, the result stays
  ≥ 1 min, and at least one period still has remaining time.
- Duration can never shrink below elapsed (floored).

### 5.3 Adding a period

A new period defaults to **fun, 24 min, no note**. Where it lands depends on how far
the current period has run:

- **Current elapsed > 60 s:** insert **after** the current period and immediately move
  to it — the current period completes normally (round-down + remainder carry, §4.3).
- **Current elapsed ≤ 60 s:** insert **before** the current period and make the new
  period current with a fresh start (zero elapsed). The displaced period is reset to
  an unstarted state at its planned duration (manual duration edits survive; pure
  auto-extension does not).

Any period can also be added **after an arbitrary period** via the timeline's
per-period "+" affordance; the new period immediately opens for editing (§5.5). The
session position shifts as needed so the same period stays current.

### 5.4 Removing a period

- The **current** period can be removed only if it is not the only period. The session
  first navigates away (forward normally; backward if it is the last period), which
  applies the usual completion/rewind timing rules, then the period is removed.
- Any **other** period can be removed directly (from its edit form); the position
  index shifts to keep the same period current.
- The last remaining period can never be removed.

### 5.5 Per-period edit form (timeline)

Clicking any timeline period opens an inline editor for that period:

- If the session is running it **pauses for the duration of the edit** and resumes on
  close (edit-pause: the anchor, if any, survives; on an anchored session the clock
  effectively keeps running and the current period absorbs the edit time on close).
- Editable: duration (hour presets 0–4, minute presets 0/3/6…57, free numeric entry
  1–900 min), type (work/break/fun), note. Changes apply live.
- Duration semantics depend on lifecycle: for a **past** period the change **amends
  the record** (elapsed = duration = new value, remaining 0); for the current or a
  future period it sets the planned duration. The active period's duration cannot be
  set below its elapsed.
- Delete button removes the period (§5.4).
- Save: click outside or Enter (keeps changes). Cancel: Escape (restores the period
  exactly as it was). Either way the session resumes if it was running.
- Pressing Enter with nothing focused opens this editor for the current period.

### 5.6 Changing type

- Cycle current period's type work → break → fun → work (button / T key), or set it
  directly (W / B / F keys). Allowed whenever a current period exists.

---

## 6. Named period configs

A **config** is a named, persisted text definition of a timeline.

### 6.1 Format

One period per line:

```
<Type> <Duration> <Note>
```

- `Type`: `W`, `B`, or `F` (case-insensitive) — work / break / fun.
- `Duration`: plain integer = minutes; with a colon = `h:mm`.
- `Note`: optional free text (rest of line).
- Empty lines and unparseable lines are silently ignored.
- Durations parse to a 1-minute floor when applied (a `W 0` line yields a 1-min period).
- An optional anchor header `@h:mm` (24 h, today) may appear on its own line (§8.2).

### 6.2 Behavior

- The built-in "Default" config (§2.4) is always first and **read-only**.
- Users can create unlimited configs: **add** (starts as `F 3`, auto-named
  "Config N" with N = highest existing N + 1, so deletions never collide),
  **duplicate**, **rename**, **delete** (deleting the active config falls back to the
  built-in). All CRUD persists immediately.
- Selecting a config applies it to the timeline instantly; the selection is remembered
  as the **active config** — the target of the Reset button and the baseline for the
  stats "original" bars (§9.3).
- Config text edits have **no save button**: each keystroke persists and re-applies to
  the timeline live (which also resets the schedule — configs are only editable while
  nothing meaningful has elapsed, so this is lossless).

### 6.3 Gating between the two editor modes

One panel toggle serves two modes, keyed on whether meaningful time has elapsed
(threshold: total elapsed ≥ 1 min — the same condition that enables Finish):

- Below the threshold: **Durations config** — pick/edit named configs (this section).
- At/above it: **Edit current durations** — the live editor (§7).
- Once a live-edit session is open, it stays in live mode even if the user edits
  elapsed back below the threshold mid-edit (the editor never flips out from under
  the user).

---

## 7. Live editor ("Edit current durations")

A text view of the **running timeline**, editable in place.

### 7.1 Format

One period per line:

```
<Type> <elapsed>/<total> <Note>
```

- `elapsed` is omitted when 0 (the line is then `<Type> <total> <Note>`).
- Time tokens: plain integer = minutes; one colon = `h:mm`; two colons = `h:mm:ss`.
- On render, `elapsed` is shown as `h:mm:ss` (it carries seconds) and `total` as
  minutes or `h:mm`.
- An optional anchor line may appear (§8.4).

### 7.2 Behavior

- Opening the editor **pauses** the session (edit-pause — the anchor survives);
  closing resumes it only if it had been running. On an anchored session the wall
  clock keeps ticking through the edit: on close the current period absorbs the
  editor time, auto-extending if it overran. The editor's caption says which of the
  two is happening ("timer paused" vs "anchored, clock keeps running").
- Edits apply **live** on every keystroke. Empty or entirely unparseable text is
  ignored (no destructive apply). Invalid lines are dropped; if the period count
  shrinks below the current position, the position clamps to the last period.
- Applied values are normalized: elapsed ≥ 0; total = max(1 min, typed total,
  elapsed) — a typed total below elapsed grows to cover it.
- Past/future periods take their typed elapsed literally; the **current** period's
  elapsed is realized by shifting the session's start reference (unanchored) or
  derived from the anchor, ignoring the typed value (anchored, §8.6).
- External changes made while the editor is open (buttons, keyboard shortcuts) are
  mirrored back into the text; the user's own typing is never reformatted under the
  cursor.
- The Start/Pause control is disabled while the panel is open. Escape closes it
  (even while the text area is focused); the E key opens it.

---

## 8. Anchored start mode

A session can be **pinned** to a wall-clock start time. While anchored, the session's
total elapsed is nailed to the wall clock — "started at 9:00" stays true no matter
what is edited.

### 8.1 Pinning and unpinning

- Toggles: click the timeline's start-time label, the thumbtack button, or the P key.
  Disabled while paused or finished.
- Pin while **running**: freezes the current derived start (now − total elapsed) as
  the anchor — pinning changes nothing visibly, it just locks the start in place.
- Pin while **idle**: anchors to now (or to a config's `@h:mm`, §8.2).
- Unpin: clears the anchor; the session continues in normal mode.

### 8.2 Anchors from a config (`@h:mm` header)

Applying a config whose text contains an `@h:mm` line arms an anchor at that time
today:

- **Future time** → the session is **armed**: an indicator shows
  "Starts at H:MM · in M:SS" counting down, and the session **auto-starts** at that
  moment (the one self-acting transition in the product). Pressing Start early
  ("Start now") re-pins to the present and starts immediately.
- **Past time** → the indicator shows "Start from H:MM" and the session waits for a
  manual Start; the first period then absorbs the whole gap since the anchor as
  already-elapsed time (auto-extending as needed, §4.2).
- An armed-but-not-started state persists across restarts; if the moment has already
  passed on reload, it does **not** auto-start — it becomes the "past time" case.

### 8.3 Armed state

"Armed" = idle + anchored. The start-time label shows the anchor (with a day
qualifier when it is before today: "yesterday", or a short date like "30 Dec").

### 8.4 Anchors in the live editor

The live editor accepts an anchor line with an optional day qualifier:

| Form              | Meaning                                                          |
| ----------------- | ---------------------------------------------------------------- |
| `@h:mm`           | today only — a time later than now is invalid, never "yesterday" |
| `@yesterday h:mm` | explicitly yesterday                                             |
| `@30 Dec h:mm`    | the most recent past occurrence of that date                     |

Validity rules (an invalid typed anchor **leaves the anchor state unchanged** — the
record is never silently rewritten):

- A future-resolving time is invalid (crossing midnight requires an explicit
  qualifier, so a typo can't inject hours from yesterday).
- An anchor newer than the past periods' typed elapsed allows is invalid (the current
  period's derived elapsed would go negative, contradicting the record).
- A half-edited line still starting with `@` keeps the previous anchor; **only fully
  deleting the anchor line unpins.**
- An anchor **older** than the whole typed timeline is valid — the current period
  absorbs the surplus on editor close. Any past time works, no matter how old.
- A typed anchor resolving into the same minute as the existing anchor keeps the
  existing exact timestamp (seconds preserved) — editing other lines never nudges
  the recorded start.
- Anchors from before today serialize back **with** their day qualifier, so
  re-parsing the mirrored text always resolves to the same day.

### 8.5 What breaks the anchor

- A user-facing **Pause** unpins. Reset unpins (then possibly re-arms from the config
  header). Finishing clears it.
- Edit-pauses (live editor, per-period form) do **not** unpin — the clock keeps
  running through them and the current period absorbs the time on close.

### 8.6 Elapsed adjustment while anchored

While anchored, the current period's elapsed is **clock-owned** (derived from the
anchor plus the completed periods' records), so shifting the start is not available.
Instead, elapsed adjustment **transfers recorded time across the boundary with the
previous period**, keeping the anchor and the session total fixed:

- **Forward:** the previous period's record shrinks, the current period's derived
  elapsed grows by the same amount. Clamped so the previous record never drops below
  1 min.
- **Backward:** the reverse; clamped at the current period's elapsed (floor 0).
- The transfer slides the **boundary**, not the current period's end: the current
  period's duration follows its elapsed one-for-one (plan and effective duration move
  together, preserving any auto-extension gap, making the move exactly reversible),
  so remaining — and every projected clock time to the end of the session — is
  unchanged.
- **Exception — "move time to previous"** (Backspace): keeps the current period's
  _length_ instead of its end; it starts and therefore ends later — exactly as that
  action behaves unanchored.
- On the **first period** there is no previous period to transfer with: elapsed
  adjustment is unavailable.
- The snap-to-3 arrows measure against the **current period's** elapsed (floored to a
  whole minute) in anchored mode — the session total cannot move, so it can't be the
  reference.
- Period boundaries otherwise behave exactly like normal mode: overruns auto-extend
  and later periods shift. The anchor fixes only the session start and the completed
  periods' records. Any clock gap (late start on a past anchor, sleep/reload, time in
  the live editor) lands entirely on the current period — an anchored session never
  loses wall-clock time and never self-finishes.

---

## 9. Display

### 9.1 Timeline

The centerpiece: one horizontal band, one block per period.

**Geometry — everything is minute-proportional.** The band is divided into one unit
per whole minute of the session's total duration; each block spans its duration in
whole minutes (floored), so widths are exact minute counts, not percentages of
arbitrary size. All fills and markers below snap to the same minute grid.

**Every block shows:**

| Element        | Value / rule                                                                      |
| -------------- | --------------------------------------------------------------------------------- |
| Type           | color-coded work / break / fun                                                    |
| Duration label | effective duration, compact: bare minutes under 1 h, else `h:mm` (nearest minute) |
| Note           | free text, when set                                                               |
| Elapsed fill   | darkened overlay from the left edge, width = elapsed minutes / duration minutes   |
| End clock time | projected end (§9.2), rendered as stacked `HH` over `mm`                          |

**The first block additionally shows** the session **start clock time** (stacked
`HH`/`mm`), prefixed with a day qualifier when the start lies before today
("yesterday" / "30 Dec"). This label doubles as the **pin toggle** — it shows a
thumbtack and is highlighted while anchored.

**The current block additionally shows:**

- An outline marking it active.
- A **playhead**: a vertical line at the elapsed edge, overshooting the band above
  and below, carrying (top to bottom):
    1. **session total elapsed** — `h mm`, floored to the minute;
    2. **current period `elapsed ◂▸ remaining`** — elapsed floored, remaining ceiled;
    3. **current wall-clock time** — `HH mm`, refreshed every second.
- A background **sub-scale**: alternating stripes of 12 minutes each across the
  block, giving a visual ruler inside the running period.
- An **overrun overlay** once elapsed exceeds the planned duration: the columns from
  the planned-duration mark to the block's end are tinted, so the auto-extended zone
  is visibly distinct from the plan (invariant 4 made visible).

**Interaction:** blocks are clickable → per-period edit form (§5.5); each block has
a "+" affordance → insert after it (§5.3). The "absolute times" toggle hides the
clock-derived values (start label, end labels, playhead wall-clock line); the
elapsed/remaining numbers stay.

### 9.2 Clock-time projection

- Start time = anchor when pinned (stable), else `now − total elapsed` (drifts with
  edits).
- Past periods' end times are laid out from that start by their recorded durations;
  the current period ends at `now + its remaining`; future periods stack onto that.
- When no period is current: an **idle** session projects the schedule forward from
  now; a **finished** one counts back from now, preserving its historical times
  instead of jumping to a future projection.

### 9.3 Stats

A per-type summary band below the timeline. All values are **sums across all
periods of that type** (durations, elapsed, remaining respectively).

**Heading:** the session's total effective duration, `h:mm` + " total".

**Layout — mirror chart around two anchor lines.** Like the timeline, the band is
minute-proportional (one unit = one minute). The three types occupy fixed lanes:

- **break** bars grow **leftward**, right-aligned against the left anchor line;
- **fun** bars are **centered** between the two anchor lines;
- **work** bars grow **rightward**, left-aligned against the right anchor line.

Each lane reserves `max(original, current planned)` minutes of width; the band's
total width is the sum of the three maxima. Two bars are overlaid per type:

- **original** (full height, backdrop): the type's total planned duration **in the
  active config** — the baseline the session was reset from.
- **current** (half height, centered overlay): the type's total planned duration
  **now**. Because both are drawn from the same anchor line, any drift between plan
  and baseline sticks out in either direction.

**Numbers displayed per type:**

| Value                 | Where / rule                                                                                                                                                                                                                                                                                                                 |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Original total        | label on the original bar: `<type> h:mm`                                                                                                                                                                                                                                                                                     |
| Current planned total | label on the current bar: `h:mm`                                                                                                                                                                                                                                                                                             |
| Remaining             | `(X remains)` suffix on the current bar, remaining ceiled — shown only while the type is partially consumed (remaining > 0 **and** ≠ planned, i.e. started but not finished)                                                                                                                                                 |
| Elapsed               | darkened fill inside the current bar, width = elapsed / planned, anchored to the lane's anchor-line side (break: right, fun: center, work: left), with its own label (floored). Hidden entirely while the type's elapsed < 1 min, and dropped once the type is fully consumed (elapsed = planned — the whole bar is elapsed) |
| Work projected        | only while the **current period is a work period**: a marker line inside the work current bar at `work elapsed so far + current period's remaining`, with its label — where the work total will stand if the current period completes on plan                                                                                |

### 9.4 App/tab title

- Idle: `Tymer`.
- Running: current period as `<T> <elapsed>/<planned>` (e.g. `W 5/25`), with a 🛑
  marker once elapsed exceeds the plan (`W 🛑 27/24`); values as bare minutes while
  both remaining and duration are under an hour, `h:mm` otherwise; plus a
  `[running]` flag. **Rounding exception:** the bare-minute values are **ceiled**
  (26.5 min elapsed reads `27`), unlike elapsed everywhere else (§9.5); the `h:mm`
  form rounds to the nearest minute.
- `[editing durations]` flag while the panel is open.

### 9.5 Rounding conventions

- Elapsed displays round **down** to the minute; remaining displays round **up**
  (a period with 1 ms left still shows 1 minute remaining, never a premature 0).
- Durations round to the nearest minute.
- Exception: the tab title's bare-minute progress values are ceiled (§9.4).
- Bar/fill widths use whole floored minutes (a 26.5-min elapsed fill spans 26 units).

---

## 10. Sound system

### 10.1 Events

All marks are measured against the current period's **planned** duration (not the
auto-extended one) and expressed in minutes:

| Event          | Marks                                  | Announces                                                                   |
| -------------- | -------------------------------------- | --------------------------------------------------------------------------- |
| Elapsed        | 6, 12, 24, 36, 48, 60, 72, 84, 96, 108 | time spent in the period                                                    |
| Remaining      | 24, 12, 6 before the planned end       | time left in the period                                                     |
| Time's up      | at the planned end                     | **the next period's type** (work/break/fun), or "finish" on the last period |
| Overtime       | 6, 12, …, 48 past the planned end      | overrun length; a distinct variant set for break periods                    |
| Timer finished | on Finish                              | one-shot fanfare                                                            |
| Button         | on every control press                 | click feedback                                                              |

Every period announcement (elapsed/remaining/timesup/overtime) is preceded by a short
random **notification chime** (pool of 78), then the spoken clip.

### 10.2 Scheduling rules

- Each mark has a ±2 s trigger window around its target. Overlapping windows are
  collected as a group; when the group has fully passed, exactly **one** sound plays —
  the highest priority wins: time's up > overtime > remaining > elapsed; ties go to
  the earlier target. (Announcements therefore land ~2 s after their mark.)
- **Threshold rule** — elapsed and remaining announcements never fight: the cutover
  point is `max(planned/2, planned − 24 min)`. Before it only elapsed marks may play;
  from it on only remaining marks may.
- No sounds while paused; pausing clears any pending window state.
- Changing period, changing duration, or adjusting elapsed **backward** clears window
  state (no stale or double announcements); adjusting forward may land inside a later
  window and trigger it normally. Skipped-over marks do not fire.

### 10.3 Voice sets and controls

- Announcements are spoken clips organized in **voice sets** (interchangeable takes
  per event per voice). The user selects a set or "all" (random across sets);
  selection persists and switching is instant.
- Consecutive plays of the same event never repeat the same take.
- Non-speech sounds (chimes, button, finish) belong to every set.
- If a chosen set lacks a clip for some event, playback falls back to the full pool —
  a partial voice degrades to other voices, never to silence.
- **Mute toggle** (persists): muting also silences anything currently playing.
  Independent of the voice-set choice.

---

## 11. Persistence

Everything survives restart; there is no server and no account.

| What                                                              | When saved            |
| ----------------------------------------------------------------- | --------------------- |
| Full session (periods + schedule)                                 | on every state change |
| Named configs and the active config id                            | on every change       |
| Deadlines and their silenced occurrences (§15)                    | on every change       |
| Preferences: mute, voice set, theme, clocks visible, compact mode | on toggle             |

- Because elapsed is clock-derived, "restore" of a running session is trivial: the
  wall clock did the counting (§3.5).
- A missing or structurally invalid saved session falls back to the default timeline
  — deliberately no migrations: a stale shape means a clean reset.
- Deadlines persist **outside** the session blob — config switches and Finish
  leave them untouched; **Reset does not** — it rebuilds the deadline list from
  the active config, so nothing set elsewhere survives it (§15.1). Reopening the
  app with an unsilenced overdue deadline resumes its alarm; each deadline's
  chime, however, is per browser session and re-picked after a reload (§15.4).

---

## 12. Preferences and modes

| Preference     | Values / default          | Effect                                               |
| -------------- | ------------------------- | ---------------------------------------------------- |
| Mute           | off (sound on) by default | §10.3                                                |
| Voice set      | "all" by default          | §10.3                                                |
| Absolute times | on by default             | show/hide start, end, and wall-clock times           |
| Compact mode   | off by default            | condensed timeline; hides the period-control buttons |
| Theme          | default / nord            | visual only                                          |

---

## 13. Controls reference

### 13.1 Availability guards (single source of truth)

| Action                   | Available when                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------------ |
| Start / Pause / Resume   | not finished, total remaining > 0, panel closed                                            |
| Reset                    | modified from active config, or started, or finished                                       |
| Next period              | current period exists, not on last period, not finished                                    |
| Previous period          | current period exists, index > 0, not finished                                             |
| Finish                   | current period exists, total elapsed ≥ 1 min                                               |
| Config editing           | total elapsed < 1 min (¬Finish)                                                            |
| Adjust elapsed back      | current exists; unanchored: total elapsed > 0; anchored: index > 0 and current elapsed > 0 |
| Adjust elapsed forward   | current exists; anchored additionally: index > 0 and previous record > 1 min               |
| Adjust duration up       | current exists, not finished                                                               |
| Adjust duration down     | plus: current remaining covers the decrease, result ≥ 1 min, some remaining exists         |
| Change type / add period | current period exists                                                                      |
| Remove period            | current exists and more than one period                                                    |
| Move time to previous    | current exists, index > 0, total elapsed > 0                                               |
| Pin / unpin              | not paused, not finished                                                                   |

### 13.2 Keyboard map

Shortcuts are inert while a text field is focused (Escape excepted).

| Key               | Action                                                    |
| ----------------- | --------------------------------------------------------- |
| Space             | start / pause / resume                                    |
| PageDown / PageUp | next / previous period                                    |
| ← / →             | elapsed: snap to previous / next multiple of 3 min (§5.1) |
| Alt + ← / →       | elapsed −1 / +1 min                                       |
| Ctrl + ← / →      | elapsed −6 / +6 min                                       |
| Shift + ← / →     | elapsed −24 / +24 min                                     |
| Home              | reset current period's elapsed to 0                       |
| End               | jump elapsed to the current period's end                  |
| − / +             | duration: snap down / up to multiple of 3 min             |
| Alt + − / +       | duration −1 / +1 min                                      |
| Ctrl + − / +      | duration −6 / +6 min                                      |
| Shift + − / +     | duration −24 / +24 min                                    |
| T                 | cycle current period type                                 |
| W / B / F         | set type work / break / fun                               |
| A, Insert         | add period (§5.3)                                         |
| Delete            | remove current period                                     |
| Backspace         | move all current elapsed to previous period               |
| Enter             | edit current period (inline form)                         |
| E                 | open durations panel (config or live editor per §6.3)     |
| Escape            | close durations panel / cancel period edit                |
| P                 | pin / unpin start time                                    |
| S                 | silence the ringing deadline alarm (§15)                  |
| M                 | mute / unmute                                             |
| V                 | cycle voice set                                           |

Button equivalents exist for: move-time-to-previous; elapsed reset/−6/−1/+1/+6;
duration −6/−1/+1/+6; change type; add/remove period — plus the transport row
(panel toggle, Reset, Start/Pause, previous/next, Finish).

---

## 14. Timing edge cases — consolidated checklist

Scenarios a port must reproduce exactly:

1. **Reload mid-session**: elapsed continues from the wall clock; the gap lands on
   the current period; auto-extension absorbs any overrun in one step.
2. **Pause across midnight / long pauses**: resume shifts the start by the pause
   length — the pause contributes nothing; day markers appear on the start label
   once it falls before today.
3. **Sub-minute period completion**: record snaps up to 1 min; the next period starts
   "in debt" and reads 0 elapsed until the credit is repaid (§4.3).
4. **Remainder carry**: completing at e.g. 24:37 records 24:00 and starts the next
   period with 37 s already elapsed.
5. **Revisiting periods**: previous gets +1 min on arrival and resumes its elapsed;
   the departed period's elapsed is preserved for a later return.
6. **Elapsed backward then forward**: lossless — relaxation returns duration to plan;
   projected end times do not drift across a round trip.
7. **Snap keys on a live clock**: reference floored to a whole minute; from an exact
   multiple of 3, down moves a full 3 min — the keys always step, never fight the tick.
8. **Anchored transfer convergence**: deltas are measured against what the adjustment
   actually moves (current period elapsed, floored) — never against the wall-clock-
   fixed session total, which would never converge and would bleed sub-minute time
   out of the previous period's record on every press.
9. **Anchored transfers preserve end times** (except move-time-to-previous, which
   deliberately shifts the current period's end later).
10. **Anchor validity in the editor**: future = invalid; too-new-for-the-record =
    invalid; half-typed `@` = keep; same-minute = keep exact seconds; only a deleted
    line unpins.
11. **Armed auto-start**: fires at the anchor moment; survives restarts as armed but
    never auto-starts retroactively.
12. **Finish filtering**: sub-minute periods vanish from the final record; the
    finished timeline projects its clock times backward from now.
13. **Sound dedup at boundaries**: overlapping windows resolve to a single
    highest-priority announcement; backward adjustments clear pending sounds; paused
    sessions are silent.
14. **Elapsed/remaining threshold**: a short period (< ~48 min plan) announces "6 min
    elapsed" but suppresses e.g. "24 elapsed" once past `max(half, plan − 24 min)`,
    switching to remaining announcements instead.

---

## 15. Deadlines

Wall-clock targets, independent of the period list — the session's periods say how
long things take, deadlines say when something must be done. Several may exist at
once. They persist separately from the session and survive config switches and
reloads — but not a Reset, which rebuilds them from the active config.

### 15.1 Defining

Deadlines are created, edited, and removed **only as text**, via `+` lines accepted
anywhere in either durations editor (named configs §6, live editor §7). Every valid
`+` line counts, one deadline each:

| Form                | Meaning                                   |
| ------------------- | ----------------------------------------- |
| `+h:mm Label`       | **daily** — recurs every day at that time |
| `+today h:mm Label` | **absolute** — that moment today          |
| `+tomorrow h:mm`    | absolute, tomorrow                        |
| `+yesterday h:mm`   | absolute, yesterday (already overdue)     |
| `+30 Dec h:mm`      | absolute, that date in the current year   |

The label is optional free text. Round-tripping is exact: an absolute deadline
always serializes **with** a day qualifier (`today` included) — a bare `+h:mm`
would re-parse as daily, silently changing kind.

Ownership mirrors the anchor contract: the **live editor owns the list** — its
valid `+` lines replace it, no `+` line at all clears it, and `+` lines present
but none valid (a half-edited sole line) leave it untouched. A **config apply only
sets** — a config without `+` lines never wipes deadlines set elsewhere, so a
daily deadline survives switching configs.

**Reset is the exception, and owns the list like the live editor does**: after a
Reset the deadlines are exactly what the active config's `+` lines declare, and
none at all if it declares none. Reset means "back to what this config says" for
the timeline, the anchor, and the deadlines alike — nothing set elsewhere
survives it.

### 15.2 Occurrences

A daily deadline resolves to _the current day_ at its time; after midnight it
rolls over and is pending again. An absolute deadline is its timestamp. All
alarm/overdue logic operates on this resolved **occurrence timestamp**. Deadlines
run on their own 1 Hz clock — they must fire while the timer is idle too.

### 15.3 Display

Each deadline is a **dashed vertical line** over the timeline at its clock
position (same projection as §9.2's start), clamped to the band's edges so it
stays visible even when it falls outside the session's span. It carries:

- right of the line: the time, a day qualifier when not today, and the label;
- left of the line, always visible: a **countdown** — `0:01` one minute before
  the deadline, `-0:01` one minute past it (elapsed floored, remaining ceiled).

Past its moment the marker switches to the danger color and pulses. This **red
state is tied to being overdue, not to the alarm** — it keeps pulsing after the
alarm is silenced, until the occurrence rolls over (daily) or the deadline is
removed.

### 15.4 Alarm

Crossing a deadline starts an alarm: a notification chime replayed back-to-back
with no gap. The chime is chosen at random **once per deadline** and kept for the
rest of the browser session (in memory only), so a given deadline always sounds
the same.

At most **one** alarm rings at a time, owned by the **latest expired** occurrence:

- When a newer deadline expires while an older one is still ringing, the older is
  turned off **for good** — it must not resume even if the newer deadline is later
  deleted.
- Silencing (bell button on the ringing marker's label, or `S`) is recorded per
  occurrence timestamp: an absolute deadline stays quiet forever; a daily one
  alarms again at its next day's occurrence.
- A deadline that is already overdue the moment it is typed starts silenced — the
  alarm is for the live crossing (and for reopening the app while an unsilenced
  overdue deadline exists), not for editor keystrokes.

## 16. Out of scope for this document

- Web/PWA delivery: service worker, caching, update/reload policy, build identity.
- Debug surfaces (debug panel, playback log, verbose logging).
- Sound asset production (TTS generation, normalization, manifests) — the port only
  needs the event → clip-pool contract of §10.
- Visual design specifics (colors, layout, fonts, themes' palettes).
