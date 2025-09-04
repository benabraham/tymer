import { describe, it, expect, beforeEach } from 'vitest'
import { SoundScheduler } from './sound-scheduler'

describe('SoundScheduler', () => {
    let scheduler
    
    beforeEach(() => {
        scheduler = new SoundScheduler(2000)
    })
    
    describe('window detection', () => {
        it('detects when elapsed time is within window', () => {
            // Test ±2 second window
            expect(scheduler._isInWindow(360000, 359000)).toBe(true) // 1 sec before
            expect(scheduler._isInWindow(360000, 361000)).toBe(true) // 1 sec after
            expect(scheduler._isInWindow(360000, 358000)).toBe(true) // 2 sec before
            expect(scheduler._isInWindow(360000, 362000)).toBe(true) // 2 sec after
            expect(scheduler._isInWindow(360000, 357999)).toBe(false) // Just outside
            expect(scheduler._isInWindow(360000, 362001)).toBe(false) // Just outside
        })
        
        it('uses custom window size when provided', () => {
            const customScheduler = new SoundScheduler(3000) // ±3 seconds
            expect(customScheduler._isInWindow(360000, 357000)).toBe(true)
            expect(customScheduler._isInWindow(360000, 363000)).toBe(true)
            expect(customScheduler._isInWindow(360000, 356999)).toBe(false)
        })
    })
    
    describe('dynamic threshold calculation', () => {
        it('uses 50% for periods ≤48 minutes with default sounds', () => {
            // 24-minute period: threshold at 12 min (50%)
            expect(scheduler.getThreshold(24 * 60000)).toBe(12 * 60000)
            
            // 48-minute period: threshold at 24 min (50%)
            expect(scheduler.getThreshold(48 * 60000)).toBe(24 * 60000)
        })
        
        it('uses max remaining sound for periods >48 minutes', () => {
            // 90-minute period: threshold at 66 min (24 min remaining)
            expect(scheduler.getThreshold(90 * 60000)).toBe(66 * 60000)
            
            // 72-minute period: threshold at 48 min (24 min remaining)
            expect(scheduler.getThreshold(72 * 60000)).toBe(48 * 60000)
        })
        
        it('adjusts threshold based on available remaining sounds', () => {
            // With only 6 and 12 minute remaining sounds
            const scheduler2 = new SoundScheduler(2000, {
                elapsed: [6, 12, 24],
                remaining: [6, 12], // No 24-minute warning!
                overtime: [6, 12],
                overtimeBreak: [6, 12]
            })
            
            // 90-minute period: threshold at 78 min (12 min remaining, not 24)
            expect(scheduler2.getThreshold(90 * 60000)).toBe(78 * 60000)
            
            // With extended remaining sounds (hypothetically added 36)
            const scheduler3 = new SoundScheduler(2000, {
                elapsed: [6, 12, 24],
                remaining: [6, 12, 24, 36], // Added 36-minute warning!
                overtime: [6, 12],
                overtimeBreak: [6, 12]
            })
            
            // 90-minute period: threshold at 54 min (36 min remaining)
            expect(scheduler3.getThreshold(90 * 60000)).toBe(54 * 60000)
        })
        
        it('handles periods shorter than max remaining sound', () => {
            // 12-minute period with 24-min max remaining
            // Should use 50% (6 min) since 12-24 = -12 < 6
            expect(scheduler.getThreshold(12 * 60000)).toBe(6 * 60000)
            
            // 18-minute period: 50% (9 min) vs (18-24=-6) → use 9 min
            expect(scheduler.getThreshold(18 * 60000)).toBe(9 * 60000)
        })
    })
    
    describe('priority system', () => {
        it('prioritizes overtime > timesup > remaining > elapsed', () => {
            const windows = [
                { type: 'elapsed', priority: 1, key: 'elapsed_48', targetMs: 0 },
                { type: 'remaining', priority: 2, key: 'remaining_6', targetMs: 0 },
                { type: 'timesup', priority: 3, key: 'timesup', targetMs: 0 },
                { type: 'overtime', priority: 4, key: 'overtime_6', targetMs: 0 }
            ]
            
            const winner = scheduler.selectHighestPriority(windows)
            expect(winner.type).toBe('overtime')
            
            // Without overtime (exclude the last element)
            const winner2 = scheduler.selectHighestPriority([windows[0], windows[1], windows[2]])
            expect(winner2.type).toBe('timesup')
            
            // Without overtime and timesup (only first two)
            const winner3 = scheduler.selectHighestPriority([windows[0], windows[1]])
            expect(winner3.type).toBe('remaining')
        })
    })
    
    describe('overlapping windows', () => {
        it('waits for all overlapping windows to end before triggering', () => {
            // First tick - enters windows (6 min elapsed in 12 min break)
            let sound = scheduler.checkSounds(6*60000 - 1000, 12*60000, 'break', false)
            expect(sound).toBe(null) // Entered windows, but not exited yet
            
            // Second tick - still in windows
            sound = scheduler.checkSounds(6*60000, 12*60000, 'break', false)
            expect(sound).toBe(null) // Still inside windows
            
            // Third tick - exits all windows
            sound = scheduler.checkSounds(6*60000 + 2001, 12*60000, 'break', false)
            expect(sound).not.toBe(null)
            expect(sound.type).toBe('remaining') // Remaining 6 wins over elapsed 6
        })
        
        it('handles multiple overlapping windows correctly', () => {
            // Enter multiple windows at once
            scheduler.checkSounds(24*60000 - 1000, 48*60000, 'work', false)
            
            // Still in windows
            scheduler.checkSounds(24*60000, 48*60000, 'work', false)
            
            // Exit all windows - should trigger
            const sound = scheduler.checkSounds(24*60000 + 2001, 48*60000, 'work', false)
            expect(sound).not.toBe(null)
            expect(sound.key).toBe('remaining_24') // At 50% mark, remaining takes over
        })
    })
    
    describe('period-specific sounds', () => {
        it('plays break-specific overtime sounds for break periods', () => {
            const windows = scheduler.getAllPossibleWindows(12*60000, 'break')
            const overtimeWindows = windows.filter(w => w.type === 'overtime')
            
            expect(overtimeWindows.length).toBeGreaterThan(0)
            overtimeWindows.forEach(w => {
                expect(w.soundPath).toContain('overtime/break/')
            })
        })
        
        it('plays regular overtime sounds for work periods', () => {
            const windows = scheduler.getAllPossibleWindows(48*60000, 'work')
            const overtimeWindows = windows.filter(w => w.type === 'overtime')
            
            expect(overtimeWindows.length).toBeGreaterThan(0)
            overtimeWindows.forEach(w => {
                expect(w.soundPath).toContain('overtime/')
                expect(w.soundPath).not.toContain('break')
            })
        })
        
        it('uses correct timesup sound for period type', () => {
            const workWindows = scheduler.getAllPossibleWindows(48*60000, 'work')
            const workTimesup = workWindows.find(w => w.type === 'timesup')
            expect(workTimesup.soundPath).toBe('sounds/timesup/work.webm')
            
            const breakWindows = scheduler.getAllPossibleWindows(12*60000, 'break')
            const breakTimesup = breakWindows.find(w => w.type === 'timesup')
            expect(breakTimesup.soundPath).toBe('sounds/timesup/break.webm')
            
            const funWindows = scheduler.getAllPossibleWindows(24*60000, 'fun')
            const funTimesup = funWindows.find(w => w.type === 'timesup')
            expect(funTimesup.soundPath).toBe('sounds/timesup/fun.webm')
        })
    })
    
    describe('state management', () => {
        it('clears state on period change', () => {
            // Play a sound
            scheduler.checkSounds(6*60000 - 1000, 48*60000, 'work', false)
            scheduler.checkSounds(6*60000 + 2001, 48*60000, 'work', false)
            
            // Change period
            scheduler.onPeriodChange()
            
            // Should be able to play same time again
            scheduler.checkSounds(6*60000 - 1000, 48*60000, 'work', false)
            const sound = scheduler.checkSounds(6*60000 + 2001, 48*60000, 'work', false)
            expect(sound).not.toBe(null)
        })
        
        it('clears state on duration change', () => {
            scheduler.checkSounds(24*60000 - 1000, 48*60000, 'work', false)
            
            // Change duration
            scheduler.onDurationChange()
            
            // State should be cleared
            expect(scheduler.overlappingGroup.size).toBe(0)
            expect(scheduler.activeWindows.size).toBe(0)
        })
        
        it('handles elapsed time adjustment backward', () => {
            // Play sound at 24 min
            scheduler.checkSounds(24*60000 - 1000, 48*60000, 'work', false)
            scheduler.checkSounds(24*60000 + 2001, 48*60000, 'work', false)
            
            // Jump back to 12 min
            scheduler.onElapsedAdjustment(12*60000, 24*60000)
            
            // Should be able to trigger 24 min window again
            scheduler.checkSounds(24*60000 - 1000, 48*60000, 'work', false)
            const sound = scheduler.checkSounds(24*60000 + 2001, 48*60000, 'work', false)
            expect(sound).not.toBe(null)
        })
        
        it('keeps state when adjusting elapsed time forward', () => {
            scheduler.checkSounds(12*60000 - 1000, 48*60000, 'work', false)
            
            // Jump forward
            scheduler.onElapsedAdjustment(18*60000, 12*60000)
            
            // State should be preserved (we're moving forward, not backward)
            expect(scheduler.overlappingGroup.size).toBeGreaterThan(0)
        })
    })
    
    describe('edge cases', () => {
        it('handles very short periods (6 minutes)', () => {
            // At 3 minutes (50% mark) in a 6-minute period
            scheduler.checkSounds(3*60000 - 1000, 6*60000, 'work', false)
            const sound = scheduler.checkSounds(3*60000 + 2001, 6*60000, 'work', false)
            
            // Should not play elapsed sounds after 50%
            const activeWindows = scheduler.getActiveWindows(3*60000, 6*60000, 'work')
            const elapsedWindows = activeWindows.filter(w => w.type === 'elapsed')
            expect(elapsedWindows.length).toBe(0)
        })
        
        it('handles pause state correctly', () => {
            // Enter some windows
            scheduler.checkSounds(6*60000 - 1000, 48*60000, 'work', false)
            expect(scheduler.overlappingGroup.size).toBeGreaterThan(0)
            
            // Pause should clear everything
            const sound = scheduler.checkSounds(6*60000, 48*60000, 'work', true)
            expect(sound).toBe(null)
            expect(scheduler.overlappingGroup.size).toBe(0)
            expect(scheduler.activeWindows.size).toBe(0)
        })
        
        it('only includes remaining sounds that make sense for duration', () => {
            // 10-minute period shouldn't have 24-minute remaining warning
            const windows = scheduler.getAllPossibleWindows(10*60000, 'work')
            const remainingWindows = windows.filter(w => w.type === 'remaining')
            
            remainingWindows.forEach(w => {
                expect(w.targetMs).toBeGreaterThanOrEqual(0)
            })
            
            // Shouldn't have remaining_24 or remaining_12
            expect(remainingWindows.find(w => w.key === 'remaining_24')).toBeUndefined()
            expect(remainingWindows.find(w => w.key === 'remaining_12')).toBeUndefined()
        })
        
        it('correctly filters elapsed sounds after threshold', () => {
            // 48-minute period at 30 minutes elapsed (past 50% threshold)
            const activeWindows = scheduler.getActiveWindows(30*60000, 48*60000, 'work')
            
            // Should not have elapsed sounds since we're past threshold
            // and within remaining sound range (18 min remaining < 24)
            const elapsedWindows = activeWindows.filter(w => w.type === 'elapsed')
            expect(elapsedWindows.length).toBe(0)
        })
        
        it('includes all sounds in windows - filtering happens at trigger time', () => {
            // 72-minute period at 40 minutes elapsed
            // Past 50% (36 min) but more than 24 min remaining (32 min)
            const activeWindows = scheduler.getActiveWindows(40*60000, 72*60000, 'work')
            
            // Should not include elapsed_48 (not in window)
            const elapsed48Window = activeWindows.find(w => w.key === 'elapsed_48')
            expect(elapsed48Window).toBeUndefined() // 48 > 40, not in window
            
            // But at 48 minutes - both should be in active windows (filtering at trigger)
            const activeAt48 = scheduler.getActiveWindows(48*60000, 72*60000, 'work')
            const elapsed48 = activeAt48.find(w => w.key === 'elapsed_48')
            const remaining24 = activeAt48.find(w => w.key === 'remaining_24')
            
            expect(elapsed48).toBeDefined() // In window, filtering happens at trigger time
            expect(remaining24).toBeDefined() // In window
        })
    })
    
    describe('real-world scenarios', () => {
        it('handles a complete 48-minute work period', () => {
            const played = []
            const testPoints = [
                { time: 6*60000, expected: 'elapsed_6' },
                { time: 12*60000, expected: 'elapsed_12' },
                { time: 24*60000, expected: 'remaining_24' }, // At threshold (remaining wins)
                { time: 36*60000, expected: 'remaining_12' },
                { time: 42*60000, expected: 'remaining_6' },
                { time: 48*60000, expected: 'timesup' },
                { time: 54*60000, expected: 'overtime_6' },
            ]
            
            for (const point of testPoints) {
                // Enter window
                scheduler.checkSounds(point.time - 1000, 48*60000, 'work', false)
                // Exit window
                const sound = scheduler.checkSounds(point.time + 2001, 48*60000, 'work', false)
                
                if (sound) {
                    played.push(sound.key)
                    expect(sound.key).toBe(point.expected)
                    // Reset for next test
                    scheduler.onElapsedAdjustment(point.time + 3000, point.time)
                }
            }
            
            expect(played.length).toBeGreaterThan(0)
        })
        
        it('handles a 12-minute break period', () => {
            const played = []
            const testPoints = [
                { time: 6*60000, expected: 'remaining_6' }, // At 50% threshold (remaining wins)
                { time: 9*60000, expected: null }, // No remaining_3 available
                { time: 12*60000, expected: 'timesup' },
                { time: 18*60000, expected: 'overtime_6' },
            ]
            
            for (const point of testPoints) {
                scheduler.checkSounds(point.time - 1000, 12*60000, 'break', false)
                const sound = scheduler.checkSounds(point.time + 2001, 12*60000, 'break', false)
                
                if (point.expected && sound) {
                    played.push(sound.key)
                    expect(sound.key).toBe(point.expected)
                    scheduler.onElapsedAdjustment(point.time + 3000, point.time)
                } else if (point.expected === null) {
                    expect(sound).toBe(null)
                }
            }
        })
    })
    
    describe('threshold phase separation', () => {
        it('prevents remaining sounds before threshold - 36min period case', () => {
            const scheduler = new SoundScheduler(2000)
            const intendedMs = 36 * 60000 // 36-minute period
            
            // Simulate entering 12-minute window
            scheduler.checkSounds(12 * 60000 - 1000, intendedMs, 'work', false) // Enter window
            const sound = scheduler.checkSounds(12 * 60000 + 2001, intendedMs, 'work', false) // Exit window
            
            // Should play elapsed_12, NOT remaining_24
            expect(sound).toBeDefined()
            expect(sound.type).toBe('elapsed')
            expect(sound.minutes).toBe(12)
        })
        
        it('allows remaining sounds after threshold', () => {
            const scheduler = new SoundScheduler(2000)
            const intendedMs = 36 * 60000 // 36-minute period
            
            // At 30 minutes: after threshold (18 min), remaining_6 should play
            scheduler.checkSounds(30 * 60000 - 1000, intendedMs, 'work', false) // Enter window
            const sound = scheduler.checkSounds(30 * 60000 + 2001, intendedMs, 'work', false) // Exit window
            
            expect(sound).toBeDefined()
            expect(sound.type).toBe('remaining')
            expect(sound.minutes).toBe(6)
        })
        
        it('transitions correctly at exact threshold point', () => {
            const scheduler = new SoundScheduler(2000)
            const intendedMs = 48 * 60000 // 48-minute period (threshold at 24 min)
            
            // At exactly 24 minutes: threshold point - remaining should win
            scheduler.checkSounds(24 * 60000 - 1000, intendedMs, 'work', false) // Enter window
            const sound = scheduler.checkSounds(24 * 60000 + 2001, intendedMs, 'work', false) // Exit window
            
            // Should play remaining_24 (at exact threshold, transitioning to remaining phase)
            expect(sound).toBeDefined()
            expect(sound.type).toBe('remaining')
            expect(sound.minutes).toBe(24)
        })
        
        it('handles overlapping windows with different priorities correctly', () => {
            const scheduler = new SoundScheduler(2000)
            const intendedMs = 60 * 60000 // 60-minute period
            
            // At 48 minutes: both elapsed_48 and remaining_12 windows active
            // Threshold is at 36 minutes (60-24), so we're past it
            scheduler.checkSounds(48 * 60000 - 1000, intendedMs, 'work', false) // Enter window
            const sound = scheduler.checkSounds(48 * 60000 + 2001, intendedMs, 'work', false) // Exit window
            
            // Should play remaining_12 (past threshold, elapsed filtered out)
            expect(sound).toBeDefined()
            expect(sound.type).toBe('remaining')
            expect(sound.minutes).toBe(12)
        })
    })
    
    describe('comprehensive period duration tests', () => {
        const testPeriod = (minutes, expectedSounds) => {
            it(`handles ${minutes}-minute period correctly`, () => {
                const scheduler = new SoundScheduler(2000)
                const intendedMs = minutes * 60000
                const threshold = scheduler.getThreshold(intendedMs)
                const thresholdMin = Math.round(threshold / 60000)
                
                const played = []
                
                expectedSounds.forEach(({ time, expected }) => {
                    const timeMs = time * 60000
                    
                    // Enter window
                    scheduler.checkSounds(timeMs - 1000, intendedMs, 'work', false)
                    // Exit window
                    const sound = scheduler.checkSounds(timeMs + 2001, intendedMs, 'work', false)
                    
                    if (expected) {
                        expect(sound).toBeDefined()
                        expect(sound.key).toBe(expected)
                        played.push(`${time}min: ${expected}`)
                        // Reset state for next sound
                        scheduler.onElapsedAdjustment(timeMs + 3000, timeMs)
                    } else {
                        expect(sound).toBeNull()
                    }
                })
                
                // Log what played for debugging
                console.log(`${minutes}min period (threshold=${thresholdMin}min):`, played.join(', '))
            })
        }
        
        // 3-minute period (threshold at 1.5 min)
        testPeriod(3, [
            { time: 3, expected: 'timesup' },
            { time: 6, expected: null }, // No 6-min sounds for 3-min period
        ])
        
        // 5-minute period (threshold at 2.5 min)
        testPeriod(5, [
            { time: 5, expected: 'timesup' },
        ])
        
        // 6-minute period (threshold at 3 min)
        testPeriod(6, [
            { time: 6, expected: 'timesup' },
            { time: 12, expected: 'overtime_6' },
        ])
        
        // 8-minute period (threshold at 4 min)
        testPeriod(8, [
            { time: 8, expected: 'timesup' },
            { time: 14, expected: 'overtime_6' },
        ])
        
        // 12-minute period (threshold at 6 min)
        testPeriod(12, [
            { time: 6, expected: 'remaining_6' }, // At threshold, remaining wins
            { time: 12, expected: 'timesup' },
            { time: 18, expected: 'overtime_6' },
        ])
        
        // 15-minute period (threshold at 7.5 min)
        testPeriod(15, [
            { time: 6, expected: 'elapsed_6' },
            { time: 9, expected: 'remaining_6' }, // After threshold
            { time: 15, expected: 'timesup' },
            { time: 21, expected: 'overtime_6' },
        ])
        
        // 18-minute period (threshold at 9 min)
        testPeriod(18, [
            { time: 6, expected: 'elapsed_6' },
            { time: 12, expected: 'remaining_6' }, // After threshold
            { time: 18, expected: 'timesup' },
            { time: 24, expected: 'overtime_6' },
        ])
        
        // 24-minute period (threshold at 12 min)
        testPeriod(24, [
            { time: 6, expected: 'elapsed_6' },
            { time: 12, expected: 'remaining_12' }, // At threshold, remaining wins
            { time: 18, expected: 'remaining_6' },
            { time: 24, expected: 'timesup' },
            { time: 30, expected: 'overtime_6' },
        ])
        
        // 26-minute period (threshold at 13 min)
        testPeriod(26, [
            { time: 6, expected: 'elapsed_6' },
            { time: 12, expected: 'elapsed_12' },
            { time: 14, expected: 'remaining_12' }, // After threshold
            { time: 20, expected: 'remaining_6' },
            { time: 26, expected: 'timesup' },
        ])
        
        // 30-minute period (threshold at 15 min)
        testPeriod(30, [
            { time: 6, expected: 'elapsed_6' },
            { time: 12, expected: 'elapsed_12' },
            { time: 18, expected: 'remaining_12' }, // After threshold
            { time: 24, expected: 'remaining_6' },
            { time: 30, expected: 'timesup' },
            { time: 36, expected: 'overtime_6' },
        ])
        
        // 36-minute period (threshold at 18 min)
        testPeriod(36, [
            { time: 6, expected: 'elapsed_6' },
            { time: 12, expected: 'elapsed_12' }, // Before threshold (this was the bug!)
            { time: 24, expected: 'remaining_12' }, // After threshold
            { time: 30, expected: 'remaining_6' },
            { time: 36, expected: 'timesup' },
            { time: 42, expected: 'overtime_6' },
        ])
        
        // 42-minute period (threshold at 21 min)
        testPeriod(42, [
            { time: 6, expected: 'elapsed_6' },
            { time: 12, expected: 'elapsed_12' },
            // No sound at 18 (no elapsed_18, and remaining_24 blocked by threshold)
            { time: 30, expected: 'remaining_12' }, // After threshold
            { time: 36, expected: 'remaining_6' },
            { time: 42, expected: 'timesup' },
            { time: 48, expected: 'overtime_6' },
        ])
        
        // 46-minute period (threshold at 23 min)
        testPeriod(46, [
            { time: 6, expected: 'elapsed_6' },
            { time: 12, expected: 'elapsed_12' },
            // No sound at 22 (no elapsed sound, remaining_24 blocked by threshold)
            { time: 34, expected: 'remaining_12' }, // After threshold
            { time: 40, expected: 'remaining_6' },
            { time: 46, expected: 'timesup' },
        ])
        
        // 48-minute period (threshold at 24 min)
        testPeriod(48, [
            { time: 6, expected: 'elapsed_6' },
            { time: 12, expected: 'elapsed_12' },
            { time: 24, expected: 'remaining_24' }, // At threshold, remaining wins
            { time: 36, expected: 'remaining_12' },
            { time: 42, expected: 'remaining_6' },
            { time: 48, expected: 'timesup' },
            { time: 54, expected: 'overtime_6' },
        ])
        
        // 90-minute period (threshold at 66 min = 90-24)
        testPeriod(90, [
            { time: 6, expected: 'elapsed_6' },
            { time: 12, expected: 'elapsed_12' },
            { time: 24, expected: 'elapsed_24' },
            { time: 36, expected: 'elapsed_36' },
            { time: 48, expected: 'elapsed_48' },
            { time: 60, expected: 'elapsed_60' },
            { time: 66, expected: 'remaining_24' }, // At threshold, remaining wins
            { time: 78, expected: 'remaining_12' },
            { time: 84, expected: 'remaining_6' },
            { time: 90, expected: 'timesup' },
            { time: 96, expected: 'overtime_6' },
        ])
        
        // 120-minute period (threshold at 96 min = 120-24)
        testPeriod(120, [
            { time: 6, expected: 'elapsed_6' },
            { time: 12, expected: 'elapsed_12' },
            { time: 24, expected: 'elapsed_24' },
            { time: 36, expected: 'elapsed_36' },
            { time: 48, expected: 'elapsed_48' },
            { time: 60, expected: 'elapsed_60' },
            { time: 72, expected: 'elapsed_72' },
            { time: 84, expected: 'elapsed_84' },
            { time: 96, expected: 'remaining_24' }, // At threshold, remaining wins
            { time: 108, expected: 'remaining_12' },
            { time: 114, expected: 'remaining_6' },
            { time: 120, expected: 'timesup' },
        ])
        
        // 150-minute period (threshold at 126 min = 150-24)
        testPeriod(150, [
            { time: 6, expected: 'elapsed_6' },
            { time: 24, expected: 'elapsed_24' },
            { time: 48, expected: 'elapsed_48' },
            { time: 72, expected: 'elapsed_72' },
            { time: 96, expected: 'elapsed_96' },
            { time: 108, expected: 'elapsed_108' },
            { time: 126, expected: 'remaining_24' }, // At threshold, remaining wins
            { time: 138, expected: 'remaining_12' },
            { time: 144, expected: 'remaining_6' },
            { time: 150, expected: 'timesup' },
        ])
    })
})