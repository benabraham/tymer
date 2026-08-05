// Theme management - localStorage persistence and switching
// localStorage key: tymer-color-theme

const THEME_KEY = 'tymer-color-theme'
const DEFAULT_THEME = 'default'
const AVAILABLE_THEMES = ['default', 'nord']

export const getTheme = (): string => localStorage.getItem(THEME_KEY) || DEFAULT_THEME

export const setTheme = (theme: string): void => {
    if (!AVAILABLE_THEMES.includes(theme)) {
        console.warn(`Unknown theme: ${theme}, falling back to default`)
        theme = DEFAULT_THEME
    }
    document.documentElement.dataset.theme = theme
    localStorage.setItem(THEME_KEY, theme)
}

export const initTheme = (): void => {
    setTheme(getTheme())
}

export const getAvailableThemes = (): string[] => AVAILABLE_THEMES

export const cycleTheme = (): string => {
    const currentTheme = getTheme()
    const currentIndex = AVAILABLE_THEMES.indexOf(currentTheme)
    const nextIndex = (currentIndex + 1) % AVAILABLE_THEMES.length
    const nextTheme = AVAILABLE_THEMES[nextIndex]
    setTheme(nextTheme)
    return nextTheme
}
