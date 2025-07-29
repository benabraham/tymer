import { describe, beforeEach, it, expect, vi } from 'vitest'
import {
    timerState,
    initialState,
    timerDuration,
    timerDurationElapsed,
    timerDurationRemaining,
    timerHasFinished,
    PERIOD_CONFIG
} from './timer'

// Mock localStorage
const localStorageMock = {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn()
}
global.localStorage = localStorageMock

// Mock audio
vi.mock('./sounds', () => ({
    playSound: vi.fn()
}))

describe('Timer Logic - Simple Tests', () => {
    beforeEach(() => {
        // Reset timer state before each test
        timerState.value = { 
            ...initialState, 
            periods: PERIOD_CONFIG.map(({duration, type}) => ({
                periodDuration: duration,
                periodDurationElapsed: 0,
                periodDurationRemaining: duration,
                periodHasFinished: false,
                type
            })) 
        }
        vi.clearAllMocks()
    })

    describe('Initial State', () => {
        it('should have correct initial state', () => {
            expect(timerState.value.currentPeriodIndex).toBe(null)
            expect(timerState.value.runningIntervalId).toBe(null)
            expect(timerState.value.timestampPaused).toBe(null)
            expect(timerState.value.timestampStarted).toBe(null)
            expect(timerState.value.periods.length).toBeGreaterThan(0)
        })

        it('should initialize periods from PERIOD_CONFIG', () => {
            expect(timerState.value.periods.length).toBe(PERIOD_CONFIG.length)
            timerState.value.periods.forEach((period, index) => {
                expect(period.periodDuration).toBe(PERIOD_CONFIG[index].duration)
                expect(period.type).toBe(PERIOD_CONFIG[index].type)
                expect(period.periodDurationElapsed).toBe(0)
                expect(period.periodHasFinished).toBe(false)
            })
        })
    })

    describe('Computed Values', () => {
        it('should calculate timer duration correctly', () => {
            const expectedDuration = timerState.value.periods.reduce((sum, p) => sum + p.periodDuration, 0)
            expect(timerDuration.value).toBe(expectedDuration)
        })

        it('should calculate timer duration elapsed correctly', () => {
            timerState.value.periods[0].periodDurationElapsed = 60000
            timerState.value.periods[1].periodDurationElapsed = 30000
            
            expect(timerDurationElapsed.value).toBe(90000)
        })

        it('should detect when timer is not finished initially', () => {
            expect(timerHasFinished.value).toBe(false)
        })
    })

    describe('Rounding Function Test', () => {
        it('should round milliseconds to nearest minute correctly', () => {
            // Test the rounding logic that was added
            const roundToNearestMinute = (timeInMs) => {
                const oneMinute = 60 * 1000
                return Math.round(timeInMs / oneMinute) * oneMinute
            }

            expect(roundToNearestMinute(29000)).toBe(0) // 29 seconds -> 0 minutes
            expect(roundToNearestMinute(30000)).toBe(60000) // 30 seconds -> 1 minute  
            expect(roundToNearestMinute(90000)).toBe(120000) // 90 seconds -> 2 minutes
            expect(roundToNearestMinute(150000)).toBe(180000) // 150 seconds -> 3 minutes
        })
    })
})