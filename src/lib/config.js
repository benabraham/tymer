// Timer configuration constants
export const UI_UPDATE_INTERVAL = 1000 // time between timer updates in milliseconds
export const DURATION_TO_ADD_AUTOMATICALLY = 1 * 60 * 1000
export const COLLECTION_WINDOW = 1500 // seconds before and after target time

// Timer period configuration
export const PERIOD_CONFIG = [
cm    { duration: 36 * 60 * 1000, type: 'work', note: 'start A' },
    { duration: 6 * 60 * 1000, type: 'break', note: '' },
    { duration: 36 * 60 * 1000, type: 'work', note: 'check direction' },
    { duration: 6 * 60 * 1000, type: 'break', note: '' },
    { duration: 36 * 60 * 1000, type: 'work', note: 'finish A' },
    { duration: 18 * 60 * 1000, type: 'break', note: 'relax' },
    { duration: 36 * 60 * 1000, type: 'work', note: 'start B' },
    { duration: 6 * 60 * 1000, type: 'break', note: '' },
    { duration: 36 * 60 * 1000, type: 'work', note: 'check direction' },
    { duration: 6 * 60 * 1000, type: 'break', note: '' },
    { duration: 36 * 60 * 1000, type: 'work', note: 'finish B' },
    { duration: 18 * 60 * 1000, type: 'break', note: 'work or lunch next?' },
    { duration: 36 * 60 * 1000, type: 'work', note: 'something extra' },
    { duration: 48 * 60 * 1000, type: 'break', note: 'lunch' },
    { duration: 36 * 60 * 1000, type: 'work', note: 'start C' },
    { duration: 6 * 60 * 1000, type: 'break', note: '' },
    { duration: 36 * 60 * 1000, type: 'work', note: 'check direction' },
    { duration: 6 * 60 * 1000, type: 'break', note: '' },
    { duration: 36 * 60 * 1000, type: 'work', note: 'finish C' },
    { duration: 18 * 60 * 1000, type: 'break', note: 'relax' },
    { duration: 36 * 60 * 1000, type: 'work', note: 'start D' },
    { duration: 6 * 60 * 1000, type: 'break', note: '' },
    { duration: 36 * 60 * 1000, type: 'work', note: 'check direction' },
    { duration: 6 * 60 * 1000, type: 'break', note: '' },
    { duration: 36 * 60 * 1000, type: 'work', note: 'finish D' },
]
