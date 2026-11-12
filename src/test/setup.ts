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
// `stubGlobal`, not assignment: jsdom defines `window.localStorage` as a
// getter-only accessor, which Vitest 5 no longer papers over, so a plain
// `globalThis.localStorage = …` throws before any suite loads.
vi.stubGlobal('localStorage', localStorageMock)

// Mock intervals/timeouts
globalThis.setInterval = vi.fn() as unknown as typeof setInterval
globalThis.clearInterval = vi.fn() as unknown as typeof clearInterval

// Add required DOM environment setup for newer jsdom
globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
}
