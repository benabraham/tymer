// Timer configuration constants
export const DURATION_TO_ADD_AUTOMATICALLY = 1 * 60 * 1000
export const MIN_PERIOD_MS = 60 * 1000 // periods cannot be shorter than this

export type PeriodConfigEntry = {
    duration: number
    type: 'work' | 'break'
    note: string
}

// Timer period configuration
export const PERIOD_CONFIG: PeriodConfigEntry[] = [
    { duration: 24 * 60 * 1000, type: 'work', note: '' },
    { duration: 6 * 60 * 1000, type: 'break', note: '' },
    { duration: 24 * 60 * 1000, type: 'work', note: '' },
    { duration: 6 * 60 * 1000, type: 'break', note: '' },
    { duration: 24 * 60 * 1000, type: 'work', note: '' },
    { duration: 6 * 60 * 1000, type: 'break', note: '' },
    { duration: 24 * 60 * 1000, type: 'work', note: '' },
    { duration: 6 * 60 * 1000, type: 'break', note: '' },
    { duration: 24 * 60 * 1000, type: 'work', note: '' },
    { duration: 6 * 60 * 1000, type: 'break', note: '' },
    { duration: 24 * 60 * 1000, type: 'work', note: '' },
    { duration: 6 * 60 * 1000, type: 'break', note: '' },
    { duration: 24 * 60 * 1000, type: 'work', note: '' },
    { duration: 6 * 60 * 1000, type: 'break', note: '' },
    { duration: 24 * 60 * 1000, type: 'work', note: '' },
    { duration: 6 * 60 * 1000, type: 'break', note: '' },
    { duration: 24 * 60 * 1000, type: 'work', note: '' },
    { duration: 6 * 60 * 1000, type: 'break', note: '' },
    { duration: 24 * 60 * 1000, type: 'work', note: '' },
    { duration: 6 * 60 * 1000, type: 'break', note: '' },
    { duration: 24 * 60 * 1000, type: 'work', note: '' },
    { duration: 6 * 60 * 1000, type: 'break', note: '' },
    { duration: 24 * 60 * 1000, type: 'work', note: '' },
    { duration: 6 * 60 * 1000, type: 'break', note: '' },
    { duration: 24 * 60 * 1000, type: 'work', note: '' },
    { duration: 6 * 60 * 1000, type: 'break', note: '' },
    { duration: 24 * 60 * 1000, type: 'work', note: '' },
    { duration: 6 * 60 * 1000, type: 'break', note: '' },
    { duration: 24 * 60 * 1000, type: 'work', note: '' },
    { duration: 6 * 60 * 1000, type: 'break', note: '' },
    { duration: 24 * 60 * 1000, type: 'work', note: '' },
    { duration: 6 * 60 * 1000, type: 'break', note: '' },
    { duration: 24 * 60 * 1000, type: 'work', note: '' },
    { duration: 6 * 60 * 1000, type: 'break', note: '' },
    { duration: 24 * 60 * 1000, type: 'work', note: '' },
]
