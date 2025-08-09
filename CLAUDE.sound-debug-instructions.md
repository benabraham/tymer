# Sound Debugging Instructions

The sound system has been enhanced with comprehensive logging to debug why sounds aren't playing at expected times during a 30-minute period.

## How to Test

1. **Start the timer**: Go to http://localhost:5050/tymer/ and start a 30-minute period
2. **Open browser console**: Press F12 and go to Console tab
3. **Watch the logs**: Look for the specific logging patterns described below

## Expected Sounds for 30-minute Period

- **Minute 6**: "12 minutes elapsed" sound
- **Minute 12**: "12 minutes elapsed" sound  
- **Minute 18**: "12 minutes remaining" sound
- **Minute 24**: "6 minutes remaining" sound
- **Minute 30**: "Time is up" sound (but should only play once)

## Debugging Logs to Watch For

### 1. Main Timer Notifications
Look for logs like:
```
🎯 [TIMER_NOTIFICATIONS] t=6min: { periodElapsed: "6min", ... }
```

### 2. Elapsed Time Checks
Look for logs like:
```
🔍 [ELAPSED] t=6min checking intervals: [12, 24, 36, ...]
🔍 [ELAPSED] 12min target: 2024-..., timeDiff: -360s, inWindow: false, shouldPlay: false
```

### 3. Remaining Time Checks  
Look for logs like:
```
🔍 [REMAINING] t=18min (12min left) checking warnings: [24, 12, 6]
🔍 [REMAINING] 12min remaining target: 2024-..., timeDiff: 0s, inWindow: true, shouldPlay: false
```

### 4. Collection Window Activity
Look for logs like:
```
🪟 [WINDOW] isInCollectionWindow: currentTime=..., targetTime=..., diff=0s, window=3.5s, inWindow=true
📁 [WINDOW] Adding remaining/12 to window ... (1 sounds total)
```

### 5. Sound Resolution and Playing
Look for logs like:
```
🎯 [RESOLVE] Found 1 sounds in window: ["remaining/12"]
🔊 [RESOLVE] Playing remaining sound: 12 (beat 0 other sounds)
🎵 [PLAY] Attempting to play sound: remaining/12
✅ [PLAY] Sound remaining/12 started playing (ID: 1)
```

### 6. Period End Notifications
Look for logs like:
```
🔔 [PERIOD_END] Called with: { nextPeriodType: "work", periodElapsed: "30min", ... }
🔊 [PERIOD_END] Playing period-end notification for work (first time reaching end)
```

## Key Things to Check

1. **Are target times being calculated correctly?**
   - For 6min elapsed: Should see 12min elapsed target 6 minutes after period start
   - For 18min elapsed: Should see 12min remaining target 18 minutes after period start

2. **Is the collection window logic working?**
   - `isInCollectionWindow` should return true when within ±3.5 seconds of target
   - `shouldPlaySound` should return true when past the collection window

3. **Are sounds being added to windows?**
   - Look for "Adding ... to window" messages at the right times

4. **Are windows being resolved?**
   - Look for "Resolving ... sound" messages when window closes

5. **Why is period end playing twice?**
   - Look at the `playPeriodEndNotification` calls and timing

## Expected Timeline for 30min Period

```
t=0min:   Timer starts
t=6min:   Should see 12min elapsed target calculations, but target is at t=12min
t=12min:  12min elapsed sound should be added to window and play
t=18min:  12min remaining sound should be added to window and play  
t=24min:  6min remaining sound should be added to window and play
t=30min:  Period end sound should play once
```

## Files Modified

- `/home/srb/code/tymer2/src/lib/sounds.js` - Added comprehensive debugging logs

The logging will help identify exactly where the sound scheduling is failing.