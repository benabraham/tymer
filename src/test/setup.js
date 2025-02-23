import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Mock localStorage
const localStorageMock = {
    getItem: vi.fn(),
    setItem: vi.fn(),
    clear: vi.fn(),
    length: 0,
    key: vi.fn(),
    removeItem: vi.fn(),
}
global.localStorage = localStorageMock

// Mock intervals/timeouts
global.setInterval = vi.fn()
global.clearInterval = vi.fn()

// Add required DOM environment setup for newer jsdom
global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
}
