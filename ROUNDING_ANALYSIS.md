# Time Rounding Analysis & Fix Documentation

## Executive Summary

Fixed **3 critical rounding bugs** that caused incorrect minute displays in the timer. The core issue was using `Math.ceil` (round up) for elapsed time instead of `Math.floor` (round down), and incorrect API usage for `formatTime`.

---

## The Correct Rounding Strategy

The application uses a mathematically sound approach to ensure displayed times are intuitive:

### Core Principles

1. **Elapsed Time → `Math.floor`** (round DOWN)
   - Shows only COMPLETED minutes
   - Example: 30 min 30 sec → displays "30 min"
   - Rationale: User has completed "at least X minutes"

2. **Remaining Time → `Math.ceil`** (round UP)
   - Shows FULL minutes remaining
   - Example: 0 min 30 sec → displays "1 min"
   - Rationale: User has "at most X minutes left"

3. **Total Duration → `Math.round`** (round to NEAREST)
   - Shows most accurate total
   - Example: 60 min 0 sec → displays "60 min"

4. **Mathematical Property:**
   ```
   floor(elapsed) + ceil(remaining) = round(total)
   ```
   This ensures the display is consistent: "2 min elapsed + 10 min remaining = 12 min total"

---

## Bugs Found & Fixed

### Bug #1: Incorrect `formatTime` API Usage
**Location:** `src/components/timer/timer.jsx:60-69`

**Before (WRONG):**
```javascript
formattedPeriodDurationElapsed = formatTime(
    period.periodDurationElapsed,
    true,   // ❌ Passing boolean as 2nd parameter
    false,  // ❌ Passing boolean as 3rd parameter
)
```

**Problem:** The `formatTime` function expects an **options object** as the second parameter:
```javascript
formatTime(ms, { mode, debug, compact })
```

Passing `true, false` caused the function to:
1. Receive `true` as the options object (invalid)
2. Fall back to default rounding mode (`Math.round`)
3. **ROUND elapsed time instead of FLOORING it**

**After (FIXED):**
```javascript
formattedPeriodDurationElapsed = formatTime(
    period.periodDurationElapsed,
    { mode: 'elapsed' },  // ✅ Correct options object
)
```

**Impact:**
- Before: 30 min 30 sec displayed as "31 min" ❌
- After: 30 min 30 sec displays as "30 min" ✅

---

### Bug #2: `Math.ceil` for Elapsed Time
**Location:** `src/components/timer/timer.jsx:52-54`

**Before (WRONG):**
```javascript
formattedPeriodDurationElapsed = Math.ceil(  // ❌ Rounding UP
    period.periodDurationElapsed / (60 * 1000),
).toString()
```

**Problem:** Using `Math.ceil` for elapsed time rounds UP, showing minutes that haven't been completed yet.

**After (FIXED):**
```javascript
formattedPeriodDurationElapsed = Math.floor(  // ✅ Rounding DOWN
    period.periodDurationElapsed / (60 * 1000),
).toString()
```

**Impact:**
- Before: 30 min 1 sec displayed as "31 min" ❌
- After: 30 min 1 sec displays as "30 min" ✅

---

### Bug #3: `Math.ceil` for Duration
**Location:** `src/components/timer/timer.jsx:55-57`

**Before (QUESTIONABLE):**
```javascript
periodUserIntendedDuration = Math.ceil(
    period.periodUserIntendedDuration / (60 * 1000),
).toString()
```

**Problem:** Using `Math.ceil` for total duration can be inconsistent (though less critical).

**After (FIXED):**
```javascript
periodUserIntendedDuration = Math.round(  // ✅ Round to nearest
    period.periodUserIntendedDuration / (60 * 1000),
).toString()
```

**Impact:** More consistent with the overall rounding strategy.

---

## What Was Already Correct

### 3-Minute Jump Logic (`getNextMultipleOf3Delta`)
**Location:** `src/lib/timer.js:191-197`

This was **already fixed** in commit `c3a99b7`. The implementation is **CORRECT**:

```javascript
export const getNextMultipleOf3Delta = (currentMs, direction) => {
    const currentMinutes = Math.floor(currentMs / (60 * 1000))
    const target = direction === 'up'
        ? Math.ceil((currentMinutes + 1) / 3) * 3
        : Math.floor((currentMinutes - 1) / 3) * 3
    return target * 60 * 1000 - currentMs  // ✅ Correct!
}
```

**Why it's correct:**
1. Gets the DISPLAYED value (floored to minutes)
2. Calculates target as next/prev multiple of 3
3. Returns delta to reach EXACT target in milliseconds
4. Preserves subsecond precision internally

---

## Test Scenarios

### Scenario 1: Basic Elapsed Display
```
Internal: 30 min 30 sec (1,830,000 ms)
Display:  30 min ✅ (was showing "31 min" ❌)
```

### Scenario 2: Jump to Next Multiple of 3
```
Start:    30 min 30 sec (displays "30")
Action:   Press ArrowRight
Target:   33 min (next multiple of 3 from displayed "30")
Result:   Jumps to EXACTLY 33 min 0 sec ✅
Display:  "30" → "33" ✅
```

### Scenario 3: Jump Backward
```
Start:    33 min 1 sec (displays "33")
Action:   Press ArrowLeft
Target:   30 min (prev multiple of 3 from displayed "33")
Result:   Jumps to EXACTLY 30 min 0 sec ✅
Display:  "33" → "30" ✅
```

### Scenario 4: Period Transition with Remainder
```
Period 1: 30 min 30 sec elapsed
Action:   Move to Period 2
Result:
  - Period 1 rounded down to 30 min 0 sec
  - Remainder (30 sec) carried to Period 2
  - Period 2 starts with 30 sec elapsed (displays "0 min")
  - Total elapsed: 30 min + 30 sec = 30.5 min (displays "30 min")
Display:  No surprise jumps ✅
```

### Scenario 5: Edge Case - Exact Minute
```
Internal: 30 min 0 sec (1,800,000 ms)
Display:  30 min ✅
Action:   Press ArrowRight
Result:   Jumps to EXACTLY 33 min 0 sec ✅
```

### Scenario 6: Edge Case - 59 Seconds
```
Internal: 29 min 59 sec (1,799,000 ms)
Display:  29 min ✅ (not "30 min")
Action:   Press ArrowRight
Result:   Jumps to EXACTLY 30 min 0 sec ✅
```

---

## Implementation Details

### `formatTime` Function (src/lib/format.js)
```javascript
export const formatTime = (ms, { mode, debug, compact } = {}) => {
    if (ms == null) return '––:––'

    // Debug mode shows exact seconds and milliseconds
    if (debug) { /* ... */ }

    // Apply correct rounding based on mode
    let totalMinutes
    if (mode === 'elapsed') {
        totalMinutes = Math.floor(ms / (60 * 1000))    // ✅ Floor
    } else if (mode === 'remaining') {
        totalMinutes = Math.ceil(ms / (60 * 1000))     // ✅ Ceil
    } else {
        totalMinutes = Math.round(ms / (60 * 1000))    // ✅ Round
    }

    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60

    // Compact mode: show just minutes if under 1 hour
    if (compact && hours === 0) {
        return `${minutes}`
    }

    return `${hours}:${pad(minutes)}`
}
```

### `roundDownToBaseMinute` Function (src/lib/timer.js)
```javascript
export const roundDownToBaseMinute = timeInMs => {
    const oneMinute = 60 * 1000
    const roundedDown = Math.floor(timeInMs / oneMinute) * oneMinute
    const remainder = timeInMs - roundedDown
    return { roundedDown, remainder }
}
```

Used in:
- `moveToNextPeriod` - Rounds current period down, carries remainder to next
- `handleTimerCompletion` - Rounds final period down for display

---

## Why Subsecond Precision Matters

### Internal Precision (Milliseconds)
- All calculations use millisecond precision
- Prevents rounding errors from accumulating
- Ensures smooth period transitions

### Display Precision (Minutes)
- User sees rounded minutes for clarity
- Rounding applied ONLY at display time
- Internal state always maintains exact time

### Example Flow:
```
Internal State:         1,830,543 ms (30 min 30.543 sec)
Display to User:        "30 min" (floored)
User Jumps +3 min:      Add 149,457 ms
New Internal State:     1,980,000 ms (33 min 0 sec EXACT)
Display to User:        "33 min" (no surprises)
```

---

## Testing

All existing tests pass:
```bash
✓ src/lib/format.test.js (14 tests)
✓ src/lib/sound-scheduler.test.js (44 tests)
✓ src/lib/timer-simple.test.js (16 tests)

Test Files  3 passed (3)
Tests      74 passed (74)
```

Key test cases verify:
- `formatTime` rounds correctly for all modes
- Elapsed + Remaining = Total at the minute level
- Period transitions preserve remainder
- Timer completion rounds down properly

---

## Summary

### What Was Fixed:
1. ✅ `formatTime` called with correct options object
2. ✅ Elapsed time uses `Math.floor` (not `Math.ceil`)
3. ✅ Duration uses `Math.round` (for consistency)

### What Was Already Correct:
1. ✅ `getNextMultipleOf3Delta` calculates exact target
2. ✅ `roundDownToBaseMinute` preserves remainder
3. ✅ All test cases pass

### Result:
- No more "off by one minute" displays
- Smooth jumps to multiples of 3 minutes
- No surprises during period transitions
- Consistent elapsed + remaining = total
