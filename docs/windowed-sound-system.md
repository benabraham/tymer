# Windowed Sound Notification System

## How It Works

The new sound system uses a **5-second collection window** to prevent conflicts and ensure only the highest priority sound plays.

### Timeline Example: 48-minute Period

```
Period Start (0:00)     36 min elapsed     12 min remaining     Period End (48:00)
     |                       |                     |                    |
     |<------- 5s ----><---- Collection Window ----><---- 5s ---->     |
     |                                                                  |
     
Time: 35:55  36:00  36:01  36:02  36:03  36:04  36:05  37:00
       |      |                                    |      |
       |      └── Target Time (36:00 elapsed)     |      └── Window Closes
       |                                          |
       └── Collection Starts                     └── Conflict Resolution & Play
```

### What Happens

**35:55** (5 seconds before): Collection window opens
- System detects: "36 minutes elapsed" notification scheduled
- System detects: "12 minutes remaining" notification scheduled  
- Both sounds added to the collection window

**36:00-36:05**: Collection continues
- No immediate playing
- Additional sounds can still be added if detected

**36:05** (5 seconds after): Window closes & conflict resolution
- Priority check: `remaining` (priority 2) vs `elapsed` (priority 1)
- **Result**: "12 minutes remaining" sound wins and plays
- "36 minutes elapsed" sound is discarded

## Priority System

```javascript
SOUND_PRIORITIES = {
    overtime: 4,    // Set 4: Highest priority when in overtime
    periodEnd: 3,   // Set 3: Period end announcements  
    remaining: 2,   // Set 2: Remaining time warnings
    elapsed: 1,     // Set 1: Lowest priority
}
```

## Benefits

✅ **No More Interruptions**: Sounds can't interrupt each other  
✅ **Smart Conflicts**: System automatically picks the most important sound  
✅ **Timing Accuracy**: 5-second buffer accounts for browser timing variations  
✅ **Debugging**: Console logs show which sounds "competed" and which won  

## Dynamic Timing Changes

### Window Invalidation

When timing changes occur, all active collection windows are automatically invalidated to prevent incorrect notifications:

**Triggers for Window Invalidation:**
- **Duration adjustments** (`adjustDuration`) - Period gets extended/shortened
- **Time adjustments** (`adjustElapsed`) - Time gets moved forward/backward  
- **Period transitions** (`moveToNextPeriod`, `moveToPreviousPeriod`) - Moving between periods
- **Period ID changes** - Automatic detection when `timestampStarted` or `periodDuration` changes

**Example Scenario:**
```
Timeline: Period at 35 minutes, windows scheduled for 36min and 48min
User extends period by 5 minutes (48min → 53min)

Result:
🔄 Invalidating 2 sound windows due to: duration adjustment
- Old 48min window becomes invalid (period now ends at 53min)
- New windows will be created for correct 53min timing
```

## Console Output Examples

**Normal Operation:**
```
🔊 Playing remaining sound: 12 (beat 1 other sounds)
```

**Window Invalidation:**
```
🔄 Invalidating 3 sound windows due to: moved to next period
🔄 Invalidating 1 sound windows due to: duration adjustment
```

This shows that the system automatically maintains timing accuracy even when the user makes dynamic changes.