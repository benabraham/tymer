// A button that remembers itself. Clicking blurs the button (so it does not keep
// a focus ring after acting) but records it, and a global Tab handler restores
// focus to it — pressing Tab after a click resumes where you were.
//
// It plays no sound: button sounds were switched off deliberately in a76e832.
// The remaining click sounds live in src/lib/timer.js (start/resume/pause/pin).

// Track last clicked button globally
let lastClickedButton = null

// Global Tab handler to refocus last clicked button
if (typeof window !== 'undefined') {
    document.addEventListener('keydown', e => {
        if (e.key === 'Tab' && lastClickedButton && document.activeElement === document.body) {
            e.preventDefault()
            lastClickedButton.focus()
            lastClickedButton = null
        }
    })
}

export const ActionButton = ({ onClick, children, as = 'button', ...props }) => {
    const Component = as

    const handleClick = e => {
        if (onClick) onClick(e)
        if (as === 'button') {
            lastClickedButton = e.currentTarget
            e.currentTarget?.blur()
        }
    }

    return (
        <Component {...props} onClick={handleClick}>
            {children}
        </Component>
    )
}
