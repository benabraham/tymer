import { describe, it, expect, beforeEach, vi } from 'vitest'
import { 
  timerState,
  initialState,
  startTimer,
  pauseTimer,
  resetTimer,
  adjustDuration,
  timerDuration,
  timerDurationElapsed,
  timerDurationRemaining,
  timerHasFinished
} from './timer'

describe('Timer Logic', () => {
  beforeEach(() => {
    // Reset timer state before each test
    timerState.value = { ...initialState }
    // Clear all mocks
    vi.clearAllMocks()
    // Mock Date.now() to return a fixed timestamp
    vi.setSystemTime(new Date(2024, 0, 1, 12, 0, 0, 0))
  })

  describe('Initial State', () => {
    it('should have correct initial state', () => {
      expect(timerState.value.currentPeriodIndex).toBe(null)
      expect(timerState.value.runningIntervalId).toBe(null)
      expect(timerState.value.timestampPaused).toBe(null)
      expect(timerState.value.timestampStarted).toBe(null)
      expect(timerState.value.periods.length).toBeGreaterThan(0)
    })

    it('should have correct initial computed values', () => {
      expect(timerDuration.value).toBeGreaterThan(0)
      expect(timerDurationElapsed.value).toBe(0)
      expect(timerDurationRemaining.value).toBeGreaterThan(0)
      expect(timerHasFinished.value).toBe(false)
    })
  })

  describe('Timer Controls', () => {
    it('should start timer correctly', () => {
      startTimer()
      
      expect(timerState.value.currentPeriodIndex).toBe(0)
      expect(timerState.value.timestampStarted).toBe(Date.now())
      expect(timerState.value.timestampPaused).toBe(null)
      expect(timerState.value.runningIntervalId).not.toBe(null)
    })

    it('should pause timer correctly', () => {
      startTimer()
      const intervalId = timerState.value.runningIntervalId
      
      pauseTimer()
      
      expect(timerState.value.timestampPaused).toBe(Date.now())
      expect(timerState.value.runningIntervalId).toBe(null)
      expect(clearInterval).toHaveBeenCalledWith(intervalId)
    })

    it('should resume timer correctly', () => {
      startTimer()
      pauseTimer()
      
      // Advance time by 5 seconds
      vi.advanceTimersByTime(5000)
      
      startTimer()
      
      expect(timerState.value.timestampPaused).toBe(null)
      expect(timerState.value.runningIntervalId).not.toBe(null)
      // Check that start time was adjusted by pause duration
      expect(timerState.value.timestampStarted).toBe(Date.now() - 5000)
    })

    it('should reset timer correctly', () => {
      startTimer()
      resetTimer()
      
      expect(timerState.value).toEqual(initialState)
    })
  })

  describe('Duration Adjustment', () => {
    it('should adjust duration correctly', () => {
      startTimer()
      const originalDuration = timerState.value.periods[0].periodDuration
      const adjustment = 60000 // 1 minute
      
      adjustDuration(adjustment)
      
      expect(timerState.value.periods[0].periodDuration).toBe(originalDuration + adjustment)
    })

    it('should not adjust duration if it would result in a negative duration', () => {
      startTimer()
      const originalDuration = timerState.value.periods[0].periodDuration
      const adjustment = -100000 // 1 minute
      
      adjustDuration(adjustment)
      
      expect(timerState.value.periods[0].periodDuration).toBe(originalDuration)
    })
  })
}) 