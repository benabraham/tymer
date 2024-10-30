import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/preact'
import { Timer } from './timer'
import { timerState, initialState } from './timer'

// Mock the timer-related functions
vi.mock('./timer', async () => {
  const actual = await vi.importActual('./timer')
  return {
    ...actual,
    initializeTimer: vi.fn(),
    startTimer: vi.fn(),
    pauseTimer: vi.fn(),
    resetTimer: vi.fn(),
    adjustDuration: vi.fn(),
    finishCurrentPeriod: vi.fn(),
  }
})

describe('Timer Component', () => {
  beforeEach(() => {
    // Reset timer state before each test
    timerState.value = { ...initialState }
    // Reset all mocks
    vi.clearAllMocks()
    // Set fixed time for consistent testing
    vi.setSystemTime(new Date(2024, 0, 1, 12, 0, 0, 0))
  })

  describe('Rendering', () => {
    it('should render timer information', () => {
      render(<Timer />)
      
      expect(screen.getByText(/timerDuration/)).toBeInTheDocument()
      expect(screen.getByText(/timerDurationElapsed/)).toBeInTheDocument()
      expect(screen.getByText(/timerDurationRemaining/)).toBeInTheDocument()
      expect(screen.getByText(/currentPeriodIndex/)).toBeInTheDocument()
    })

    it('should render all control buttons', () => {
      render(<Timer />)
      
      expect(screen.getByText('Start')).toBeInTheDocument()
      expect(screen.getByText('Reset')).toBeInTheDocument()
      expect(screen.getByText('-6 min')).toBeInTheDocument()
      expect(screen.getByText('-1 min')).toBeInTheDocument()
      expect(screen.getByText('+1 min')).toBeInTheDocument()
      expect(screen.getByText('+6 min')).toBeInTheDocument()
      expect(screen.getByText('Next')).toBeInTheDocument()
      expect(screen.getByText('Finish')).toBeInTheDocument()
    })

    it('should render periods table', () => {
      render(<Timer />)
      
      expect(screen.getByText('Type')).toBeInTheDocument()
      expect(screen.getByText('Duration')).toBeInTheDocument()
      expect(screen.getByText('Remaining')).toBeInTheDocument()
      expect(screen.getByText('Elapsed')).toBeInTheDocument()
      expect(screen.getByText('Finished')).toBeInTheDocument()
    })
  })

  describe('Button States', () => {
    it('should show correct start/pause/resume button text', () => {
      render(<Timer />)
      const startPauseButton = screen.getByText('Start')
      
      // Click to start
      fireEvent.click(startPauseButton)
      timerState.value = { 
        ...timerState.value, 
        runningIntervalId: 123,
        currentPeriodIndex: 0 
      }
      expect(screen.getByText('Pause')).toBeInTheDocument()
      
      // Click to pause
      fireEvent.click(startPauseButton)
      timerState.value = { 
        ...timerState.value, 
        runningIntervalId: null,
        timestampPaused: Date.now() 
      }
      expect(screen.getByText('Resume')).toBeInTheDocument()
    })

    it('should disable adjustment buttons when timer is finished', () => {
      timerState.value = {
        ...timerState.value,
        periods: timerState.value.periods.map(p => ({ ...p, periodHasFinished: true }))
      }
      render(<Timer />)
      
      expect(screen.getByText('-6 min')).toBeDisabled()
      expect(screen.getByText('-1 min')).toBeDisabled()
      expect(screen.getByText('+1 min')).toBeDisabled()
      expect(screen.getByText('+6 min')).toBeDisabled()
    })

    it('should disable next button when on last period', () => {
      timerState.value = {
        ...timerState.value,
        currentPeriodIndex: timerState.value.periods.length - 1
      }
      render(<Timer />)
      
      expect(screen.getByText('Next')).toBeDisabled()
    })
  })

  describe('Time Formatting', () => {
    it('should format time correctly', () => {
      render(<Timer />)
      
      // Set a known duration
      timerState.value = {
        ...timerState.value,
        periods: [{
          periodDuration: 3661000, // 1h 1m 1s
          periodDurationElapsed: 0,
          periodDurationRemaining: 3661000,
          periodHasFinished: false,
          type: 'work'
        }]
      }
      
      expect(screen.getByText(/01:01:01/)).toBeInTheDocument()
    })

    it('should handle null time values', () => {
      render(<Timer />)
      
      timerState.value = {
        ...timerState.value,
        periods: [{
          periodDuration: null,
          periodDurationElapsed: null,
          periodDurationRemaining: null,
          periodHasFinished: false,
          type: 'work'
        }]
      }
      
      expect(screen.getByText('–––')).toBeInTheDocument()
    })
  })

  describe('User Interactions', () => {
    it('should handle start/pause button clicks', () => {
      render(<Timer />)
      const startPauseButton = screen.getByText('Start')
      
      fireEvent.click(startPauseButton)
      expect(startTimer).toHaveBeenCalled()
      
      timerState.value = { 
        ...timerState.value, 
        runningIntervalId: 123,
        currentPeriodIndex: 0 
      }
      
      fireEvent.click(startPauseButton)
      expect(pauseTimer).toHaveBeenCalled()
    })

    it('should handle duration adjustment clicks', () => {
      render(<Timer />)
      
      timerState.value = {
        ...timerState.value,
        currentPeriodIndex: 0
      }
      
      fireEvent.click(screen.getByText('+1 min'))
      expect(adjustDuration).toHaveBeenCalledWith(60 * 1000)
      
      fireEvent.click(screen.getByText('-1 min'))
      expect(adjustDuration).toHaveBeenCalledWith(-60 * 1000)
    })

    it('should handle finish period clicks', () => {
      render(<Timer />)
      
      timerState.value = {
        ...timerState.value,
        currentPeriodIndex: 0
      }
      
      fireEvent.click(screen.getByText('Finish'))
      expect(finishCurrentPeriod).toHaveBeenCalledWith(true)
      
      fireEvent.click(screen.getByText('Next'))
      expect(finishCurrentPeriod).toHaveBeenCalled()
    })
  })
}) 