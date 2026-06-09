import { signal, computed, effect } from '@preact/signals'
import { PERIOD_CONFIG } from './config.js'

// ============================================================================
// Period-configuration store
//
// A "config" is a named, editable text definition of a list of periods.
// One line per period:  <Type> <Duration> <Note>
//   Type:     W | B | F  (work / break / fun, case-insensitive)
//   Duration: minutes if a plain number, or h:m / h:mm if it contains ':'
//   Note:     free text (optional), extra whitespace between tokens allowed
// Empty lines and lines that can't be parsed cleanly are ignored.
//
// The first config is the built-in hardcoded PERIOD_CONFIG — readonly.
// User configs are stored in localStorage. The active config is remembered so
// the reset button can restore it (see timer.js).
// ============================================================================

const TYPE_TO_CHAR = { work: 'W', break: 'B', fun: 'F' }
const CHAR_TO_TYPE = { W: 'work', B: 'break', F: 'fun' }

// --- serialization (Period config object → text line) ----------------------

const msToDurationToken = ms => {
    const totalMinutes = Math.round(ms / 60000)
    if (totalMinutes < 60) return String(totalMinutes)
    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60
    return `${hours}:${String(minutes).padStart(2, '0')}`
}

const periodConfigToLine = ({ type, duration, note }) =>
    `${TYPE_TO_CHAR[type]} ${msToDurationToken(duration)}${note ? ` ${note}` : ''}`

// --- parsing (text → [{ type, durationMs, note }]) -------------------------

const parseDurationToken = token => {
    if (token.includes(':')) {
        const parts = token.split(':')
        if (parts.length !== 2) return null
        const [h, m] = parts
        if (!/^\d+$/.test(h) || !/^\d+$/.test(m)) return null
        return (parseInt(h, 10) * 60 + parseInt(m, 10)) * 60000
    }
    if (!/^\d+$/.test(token)) return null
    return parseInt(token, 10) * 60000
}

const parseLine = line => {
    const match = line.trim().match(/^(\S+)\s+(\S+)(?:\s+(.*))?$/)
    if (!match) return null
    const type = CHAR_TO_TYPE[match[1].toUpperCase()]
    if (!type) return null
    const durationMs = parseDurationToken(match[2])
    if (durationMs === null) return null
    return { type, durationMs, note: (match[3] || '').trim() }
}

export const parseConfigText = text => text.split('\n').map(parseLine).filter(Boolean)

// --- built-in config -------------------------------------------------------

const BUILTIN_TEXT = PERIOD_CONFIG.map(periodConfigToLine).join('\n')

export const BUILTIN_CONFIG = {
    id: 'builtin',
    name: 'Default',
    text: BUILTIN_TEXT,
    readonly: true,
}

// --- persisted state -------------------------------------------------------

const STORAGE_KEY = 'periodConfigs'
const ACTIVE_KEY = 'activeConfigId'
const NEW_CONFIG_TEXT = 'F 3'

const loadConfigs = () => {
    try {
        const stored = JSON.parse(localStorage.getItem(STORAGE_KEY))
        return Array.isArray(stored) ? stored : []
    } catch {
        return []
    }
}

export const configs = signal(loadConfigs())
export const activeConfigId = signal(localStorage.getItem(ACTIVE_KEY) || BUILTIN_CONFIG.id)

effect(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(configs.value)))
effect(() => localStorage.setItem(ACTIVE_KEY, activeConfigId.value))

export const allConfigs = computed(() => [BUILTIN_CONFIG, ...configs.value])

export const activeConfig = computed(
    () => allConfigs.value.find(config => config.id === activeConfigId.value) || BUILTIN_CONFIG,
)

// --- panel visibility ------------------------------------------------------

export const configPanelOpen = signal(false)
export const toggleConfigPanel = () => {
    configPanelOpen.value = !configPanelOpen.value
}

// --- CRUD ------------------------------------------------------------------

// Autogenerate "Config N" using the highest existing N + 1 so deletions never
// cause a name collision.
const nextConfigName = () => {
    const numbers = configs.value
        .map(config => config.name.match(/^Config (\d+)$/))
        .filter(Boolean)
        .map(match => parseInt(match[1], 10))
    const next = numbers.length ? Math.max(...numbers) + 1 : 1
    return `Config ${next}`
}

const createId = () =>
    typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`

export const addConfig = () => {
    const config = { id: createId(), name: nextConfigName(), text: NEW_CONFIG_TEXT }
    configs.value = [...configs.value, config]
    activeConfigId.value = config.id
    return config
}

export const duplicateConfig = id => {
    const source = allConfigs.value.find(config => config.id === id) || activeConfig.value
    const config = { id: createId(), name: nextConfigName(), text: source.text }
    configs.value = [...configs.value, config]
    activeConfigId.value = config.id
    return config
}

export const deleteConfig = id => {
    configs.value = configs.value.filter(config => config.id !== id)
    if (activeConfigId.value === id) activeConfigId.value = BUILTIN_CONFIG.id
}

export const updateConfigText = (id, text) => {
    configs.value = configs.value.map(config => (config.id === id ? { ...config, text } : config))
}

export const updateConfigName = (id, name) => {
    configs.value = configs.value.map(config => (config.id === id ? { ...config, name } : config))
}

export const selectConfig = id => {
    activeConfigId.value = id
}
