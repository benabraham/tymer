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
// The mock only covers Storage's own methods, not its string index signature.
// `globalThis` (not `global`) — this file has no Node types, and `globalThis`
// is the standard cross-environment global, resolved by the `dom` lib.
globalThis.localStorage = localStorageMock as unknown as Storage

// Mock intervals/timeouts
globalThis.setInterval = vi.fn() as unknown as typeof setInterval
globalThis.clearInterval = vi.fn() as unknown as typeof clearInterval

// Add required DOM environment setup for newer jsdom
globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
}
