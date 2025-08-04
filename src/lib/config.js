// Timer configuration constants
export const UI_UPDATE_INTERVAL = 1000 // time between timer updates in milliseconds
export const DURATION_TO_ADD_AUTOMATICALLY = 1 * 60 * 1000

// Timer period configuration
export const PERIOD_CONFIG = [
    {duration: 36 * 60 * 1000, type: 'work', note: 'start'},
    {duration: 6 * 60 * 1000, type: 'break', note: ''},
    {duration: 36 * 60 * 1000, type: 'work', note: 'check direction'},
    {duration: 6 * 60 * 1000, type: 'break', note: ''},
    {duration: 36 * 60 * 1000, type: 'work', note: 'finish'},
    {duration: 18 * 60 * 1000, type: 'break', note: ''},
    {duration: 36 * 60 * 1000, type: 'work', note: 'start'},
    {duration: 6 * 60 * 1000, type: 'break', note: ''},
    {duration: 36 * 60 * 1000, type: 'work', note: 'check direction'},
    {duration: 6 * 60 * 1000, type: 'break', note: ''},
    {duration: 36 * 60 * 1000, type: 'work', note: 'finish'},
    {duration: 18 * 60 * 1000, type: 'break'},
    {duration: 36 * 60 * 1000, type: 'work'},
    {duration: 6 * 60 * 1000, type: 'break'},
    {duration: 36 * 60 * 1000, type: 'work'},
    {duration: 48 * 60 * 1000, type: 'break'},
    {duration: 36 * 60 * 1000, type: 'work'},
    {duration: 6 * 60 * 1000, type: 'break'},
    {duration: 36 * 60 * 1000, type: 'work'},
    {duration: 6 * 60 * 1000, type: 'break'},
    {duration: 36 * 60 * 1000, type: 'work'},
    {duration: 18 * 60 * 1000, type: 'break'},
]